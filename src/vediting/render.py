"""Frame-based picture assembly and independent audio placement."""
import hashlib
import json
import math
import subprocess
import tomllib
from fractions import Fraction
from pathlib import Path
from tempfile import TemporaryDirectory

from .media import main_video, probe, run, save_json


def ff(*args):
    return run("ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", *map(str,args))


def source_offset(stream, container):
    return Fraction(stream.get("start_time", 0)) - Fraction(container.get("start_time", 0))


def handoff_source(record):
    metadata = record["metadata"]
    streams = []
    for stream in metadata["streams"]:
        if stream["codec_type"] in ("audio", "video"):
            streams.append({
                key: stream[key] for key in ("index", "codec_type", "start_time", "duration", "disposition")
                if key in stream
            })
    return {
        "source": record["source"],
        "size": record["size"],
        "mtime_ns": record["mtime_ns"],
        "metadata": {
            "format": {key: metadata["format"][key] for key in ("start_time", "duration") if key in metadata["format"]},
            "streams": streams,
        },
    }


def render(p, timeline, inventory, root):
    cut = json.loads(timeline.read_text())
    if cut["inventory_revision"] != inventory["revision"]:
        raise ValueError("Inventory changed. Review the selects and update the timeline revision.")
    fmt = tomllib.loads((p / "project.toml").read_text())["format"]
    preset = tomllib.loads((root / "presets" / (fmt + ".toml")).read_text())
    fps = Fraction(preset["fps"])
    width, height = preset["width"], preset["height"]
    rate = preset["audio_rate"]
    cache = p / "work/segments"
    cache.mkdir(exist_ok=True)
    version = run("ffmpeg","-version").stdout.splitlines()[0]
    sources = {"clips": {}, "assets": {}}

    def source(row, audio=False):
        if audio and "asset" in row:
            path = (p / "assets" / row["asset"]).resolve()
            path.relative_to((p / "assets").resolve())
            if row["asset"] not in sources["assets"]:
                sources["assets"][row["asset"]] = probe(path, p)
            r = sources["assets"][row["asset"]]
        else:
            r = inventory["clips"][row["id"]]
            sources["clips"][row["id"]] = r
        stream = (next((s for s in r["metadata"]["streams"] if s["codec_type"] == "audio"), None)
                  if audio else main_video(r["metadata"]))
        if not stream:
            raise ValueError(f"No audio in {r['source']}")
        start = float(row["in"])
        frames = row["frames"]
        if type(frames) != int or frames <= 0 or not math.isfinite(start) or start < 0:
            raise ValueError("Invalid source interval")
        if start + float(frames/fps) > float(stream.get("duration") or r["metadata"]["format"]["duration"]) + 0.001:
            raise ValueError(f"Out of bounds: {r['source']}")
        # Input seeking is relative to container start. Selects use stream-local time.
        offset = float(source_offset(stream, r["metadata"]["format"]))
        return r, stream["index"], str(max(0,start+offset))

    with TemporaryDirectory(dir=cache) as tmp:
        tmp = Path(tmp)
        segments = []
        total = 0
        for row in cut["picture"]:
            r, index, start = source(row)
            x, y = (float(v) for v in row.get("focus",[0.5,0.5]))
            if not (0 <= x <= 1 and 0 <= y <= 1):
                raise ValueError("Focus must be within 0..1")
            vf = (f"fps={fps},scale={width}:{height}:force_original_aspect_ratio=increase:"
                  f"force_divisible_by=2,crop={width}:{height}:(iw-ow)*{x}:(ih-oh)*{y},setsar=1,"
                  "tpad=stop_mode=clone:stop_duration=1")
            key = hashlib.sha256(repr((r["source"],r["size"],r["mtime_ns"],start,index,row["frames"],vf,version)).encode()).hexdigest()
            segment = cache / (key + ".mp4")
            if not segment.exists():
                draft = tmp / "segment.mp4"
                ff("-ss",start,"-i",p/r["source"],"-map",f"0:{index}","-vf",vf,"-frames:v",row["frames"],
                   "-an","-c:v","libx264","-preset","veryfast","-pix_fmt","yuv420p",draft)
                draft.replace(segment)
            segments.append(segment)
            total += row["frames"]
        if not total:
            raise ValueError("Timeline requires picture")
        listing = tmp / "segments.txt"
        listing.write_text("".join(f"file '../{s.name}'\n" for s in segments))
        inputs = []
        filters = []
        labels = []
        duration = float(total/fps)
        for n, row in enumerate(cut["audio"],1):
            r,index,start = source(row,True)
            at = row["at"]
            if type(at) != int or at < 0 or at+row["frames"] > total:
                raise ValueError("Audio exceeds timeline")
            length = float(row["frames"]/fps)
            inputs.extend(["-ss",start,"-t",str(length),"-i",p/r["source"]])
            gain = float(row.get("gain_db",0))
            chain = f"[{n}:{index}]aresample={rate},asetpts=PTS-STARTPTS,volume={gain}dB"
            for side,flag in [("in","t"),("out","t")]:
                fade = float(row.get("fade_"+side,0))
                if not 0 <= fade <= length:
                    raise ValueError("Invalid fade duration")
                if fade:
                    chain += f",afade={flag}={side}:st={0 if side=='in' else length-fade}:d={fade}"
            samples = round(at*rate/fps)
            filters.append(chain+f",adelay={samples}S:all=1[a{n}]")
            labels.append(f"[a{n}]")
        if labels:
            filters.append("".join(labels)+f"amix=inputs={len(labels)}:normalize=0,apad,atrim=duration={duration}[mix]")
        else:
            filters.append(f"anullsrc=r={rate}:cl=stereo,atrim=duration={duration}[mix]")
        master = tmp / "master.mp4"
        ff("-f","concat","-safe","0","-i",listing,*inputs,"-filter_complex",";".join(filters),
           "-map","0:v","-map","[mix]","-c:v","copy","-c:a","aac","-ac","2","-movflags","+faststart",master)
        ff("-xerror","-i",master,"-f","null","-")
        info = probe(master,p)["metadata"]
        video = main_video(info)
        if (int(video["nb_frames"]),video["width"],video["height"]) != (total,width,height):
            raise ValueError("Master frame count or dimensions differ from timeline")
        if abs(float(info["format"]["duration"])-duration)>0.1:
            raise ValueError("Master duration differs from timeline")
        levels = run("ffmpeg","-hide_banner","-i",str(master),"-vn","-af","volumedetect","-f","null","-").stderr
        number = 1
        while (p / "exports" / f"v{number:04}.mp4").exists():
            number += 1
        name = f"v{number:04}"
        handoff_sources = {kind: {key: handoff_source(record) for key, record in records.items()}
                           for kind, records in sources.items()}
        save_json(p/"review"/(name+".json"),dict(timeline=cut,preset=preset,encoder=version,
                  inventory_revision=inventory["revision"],sources=handoff_sources,streams=info["streams"],
                  levels=[line for line in levels.splitlines() if "_volume:" in line],decoded=True))
        output = p/"exports"/(name+".mp4")
        master.replace(output)
        print(output)
