import json
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import unittest

try:
    import opentimelineio as otio
except ModuleNotFoundError:
    otio = None


class Workflow(unittest.TestCase):
    def test_project(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            repo = Path(__file__).resolve().parents[1]
            for folder in ("src","bin","templates","presets"):
                shutil.copytree(repo/folder,root/folder)
            cli = root/"bin/vediting"

            def call(*args):
                return subprocess.check_output([cli,*args],text=True)

            for fmt in ("youtube","reel"):
                call("new",fmt,"--format",fmt)
                p = root/"projects"/fmt
                for card in ("A","B"):
                    folder = p/"rushes"/card
                    folder.mkdir()
                    args = ["ffmpeg","-loglevel","error","-f","lavfi","-i","testsrc2=s=160x90:r=30"]
                    if card == "A":
                        args += ["-f","lavfi","-i","sine=frequency=440"]
                    subprocess.run(args+["-t","2",str(folder/"clip.MP4")],check=True)
                call("review",fmt)
                times = {f:f.stat().st_mtime_ns for f in p.glob("work/*/*/proxy.mp4")}
                self.assertEqual(len(times),2)
                call("review",fmt)
                self.assertTrue(all(f.stat().st_mtime_ns==t for f,t in times.items()))
                inv = json.loads((p/"work/inventory.json").read_text())
                a,b = inv["clips"]
                shutil.copyfile(p/"rushes/A/clip.MP4", p/"assets/room tone.MP4")
                timeline = dict(inventory_revision=inv["revision"],picture=[
                    dict(id=a,frames=15,chapter="Arrival",**{"in":0}),
                    dict(id=b,frames=15,chapter="Station",**{"in":0})],
                    audio=[dict(id=a,at=0,frames=30,**{"in":0}),
                           dict(asset="room tone.MP4",at=10,frames=10,gain_db=-18,**{"in":0.2})])
                (p/"edit/test.json").write_text(json.dumps(timeline))
                for version in ("v0001","v0002"):
                    call("render",fmt,"test.json")
                    self.assertTrue((p/"exports"/(version+".mp4")).exists())
                    report=json.loads((p/"review"/(version+".json")).read_text())
                    self.assertTrue(report["decoded"])
                    self.assertEqual(report["streams"][0]["nb_frames"],"30")

                if fmt == "youtube":
                    call("analyze", fmt)
                    notes = next(p.glob("work/*/*/moments.md"))
                    notes.write_text("0.2s station arrival")
                    call("analyze", fmt)
                    self.assertEqual(notes.read_text(), "0.2s station arrival")
                    progress = call("prepare", fmt, b, "--skip-graphics")
                    self.assertIn("[1/1] rushes/B/clip.MP4", progress)
                    self.assertIn("0 restant(s)", progress)
                    transcript = next((p / "work" / b).glob("*/transcript-*.json"))
                    self.assertEqual(json.loads(transcript.read_text())["status"], "sans piste audio")
                    self.assertIn("Transcription déjà prête", call("prepare", fmt, b))
                    call("goal", fmt, "arrival", "--format", "reel")
                    goal = p/"goals/arrival"
                    (goal/"edit/test.json").write_text(json.dumps(timeline))
                    call("render", fmt, "test.json", "--goal", "arrival")
                    self.assertTrue((goal/"exports/v0001.mp4").exists())
                    self.assertTrue((goal/notes.relative_to(p)).samefile(notes))
                    self.assertEqual(len(list((p/"exports").glob("*.mp4"))), 2)

                if otio is not None:
                    (p/"edit/test.json").write_text("{}")
                    call("handoff",fmt,"v0001")
                    path = p/"exports/v0001.otio"
                    handoff = otio.adapters.read_from_file(str(path))
                    picture, speaker, bed = handoff.tracks
                    self.assertEqual([marker.name for marker in picture.markers], ["Arrival", "Station"])
                    self.assertEqual(picture.markers[1].marked_range.start_time.value, 15)
                    self.assertEqual(picture.duration().value, 30)
                    self.assertAlmostEqual(picture.duration().to_seconds(), 1.001)
                    self.assertEqual(speaker[0].duration().value, 30)
                    self.assertIsInstance(bed[0], otio.schema.Gap)
                    self.assertEqual(bed[0].duration().value, 10)
                    self.assertAlmostEqual(bed[1].source_range.start_time.to_seconds(), 0.2)
                    self.assertEqual(bed[1].media_reference.target_url, (p/"assets/room tone.MP4").resolve().as_uri())
                    self.assertEqual(bed[1].metadata["vediting"]["placement"]["gain_db"], -18)
                    previous = path.stat().st_mtime_ns
                    call("handoff",fmt,"v0001")
                    self.assertEqual(path.stat().st_mtime_ns, previous)

                    (p/"assets/room tone.MP4").write_bytes(b"changed")
                    rejected = subprocess.run([cli,"handoff",fmt,"v0002"],capture_output=True,text=True)
                    self.assertNotEqual(rejected.returncode, 0)
                    self.assertIn("Source changed since v0002", rejected.stderr)
                    self.assertFalse((p/"exports/v0002.otio").exists())
