"""Local project lifecycle and media preparation."""
import argparse
import fcntl
import hashlib
import json
import os
import re
import subprocess
from time import monotonic
import tomllib
import unicodedata
from pathlib import Path

from . import media
from .handoff import export_handoff
from .render import render

ROOT = Path(__file__).resolve().parents[2]
FOLDERS = "rushes assets work edit review exports".split()


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()[:20]


def prompts(name, goal=None):
    transcript_instruction = "Use the cached timestamped transcripts for dialogue review."
    target = f"goal {goal} in project {name}" if goal else name
    skill_args = f"{name} {goal}" if goal else name
    return ("1. After copying the rushes, transcribe in Terminal on your Mac with the MLX environment active.\n"
            f"  bin/vediting transcribe {name} --skip-graphics\n\n"
            "2. Estimate the runtime\n"
            f"  Claude Code: /video-estimate {skill_args}\n"
            f"  Codex: Use $video-estimate for {target}.\n"
            f"  {transcript_instruction} Save a timecoded duration budget in the selected brief and stop there.\n\n"
            "3. Edit when ready\n"
            f"  Claude Code: /video-edit {skill_args}\n"
            f"  Codex: Use $video-edit for {target}.\n"
            f"  {transcript_instruction} "
            "Follow the brief, review the cut and deliver a versioned master.")


def analysis_prompt(name):
    return (f"Prepare review media with bin/vediting analyze {name}.\n"
            f"Claude Code: /video-analyze {name}\n"
            f"Codex: Analyze the footage in {name} and complete the current moments.md files.")


def inventory(p):
    records, errors = {}, {}
    for path in sorted((p / "rushes").rglob("*")):
        if path.is_file() and path.suffix.lower() == ".mp4":
            try:
                record = media.probe(path, p)
                media.main_video(record["metadata"])
                records[digest(record["source"])] = record
            except (ValueError, StopIteration, subprocess.CalledProcessError) as e:
                errors[str(path.relative_to(p))] = getattr(e, "stderr", "") or "No usable video stream"
    result = dict(clips=records, errors=errors, revision=digest([records, errors]))
    media.save_json(p / "work/inventory.json", result)
    return result


def status(p):
    inv = p / "work/inventory.json"
    rev = json.loads(inv.read_text())["revision"] if inv.exists() else ""
    masters = sorted((p / "exports").glob("*.mp4"))
    stage = "copy rushes / ingest"
    fmt = tomllib.loads((p / "project.toml").read_text())["format"]
    if fmt == "library":
        print(p.name, "footage library", "ingested" if rev else stage)
        return
    if rev:
        stage = "estimate"
        if f"Inventory revision: {rev}" in (p / "context.md").read_text():
            stage = "edit"
    if masters:
        stage += f" (latest export: {masters[-1].name})"
    print(p.name, fmt, stage)


def execute():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    new = sub.add_parser("new")
    new.add_argument("name")
    new.add_argument("--format", choices=["reel", "youtube"])
    goal = sub.add_parser("goal", help="Create an independent edit brief")
    goal.add_argument("project")
    goal.add_argument("slug")
    goal.add_argument("--format", required=True, choices=["reel", "youtube"])
    sub.add_parser("list")
    help_text = {
        "prompts": "Show workflow prompts for Claude Code and Codex",
        "prepare": "Prepare proxies, contact sheets and transcripts",
        "transcribe": "Create or reuse local timestamped transcripts",
    }
    for cmd in ["status", "prompts", "ingest", "analyze", "review", "transcribe", "prepare", "render", "handoff"]:
        q = sub.add_parser(cmd, help=help_text.get(cmd))
        q.add_argument("project")
        if cmd in ("review", "analyze", "transcribe", "prepare"):
            q.add_argument("ids", nargs="*")
        if cmd == "review":
            q.add_argument("--model", default=media.MODEL)
        if cmd in ("transcribe", "prepare"):
            q.add_argument("--model", default=media.MODEL)
            q.add_argument("--skip-graphics", action="store_true",
                           help="Skip transcription for generated clips under rushes/graphics")
        if cmd in ("render", "handoff", "status", "prompts"):
            q.add_argument("--goal")
        if cmd == "render":
            q.add_argument("timeline", help="JSON filename inside edit/")
        if cmd == "handoff":
            q.add_argument("version", help="Rendered version, such as v0001")
    a = parser.parse_args()
    projects = ROOT / "projects"
    if a.cmd == "new":
        slug = re.sub("[^a-z0-9]+", "-", unicodedata.normalize("NFKD", a.name).encode("ascii","ignore").decode().lower()).strip("-")
        if not slug:
            parser.error("Choose a name containing a Latin letter or digit")
        p = projects / slug
        p.mkdir(parents=True)
        for folder in FOLDERS:
            (p / folder).mkdir()
        (p / "context.md").write_bytes((ROOT / "templates/project/context.md").read_bytes())
        (p / "project.toml").write_text(f'name = {json.dumps(a.name, ensure_ascii=False)}\nformat = "{a.format or "library"}"\nschema = 1\n')
        if not a.format:
            (p / "context.md").write_text("# Footage collection\n\nPeople, locations, dates and recording notes.\n")
        workflow = prompts(slug) if a.format else (
            f"{analysis_prompt(slug)}\nThen create an edit with bin/vediting goal {slug} NAME --format reel"
        )
        print(p / "rushes", p / "context.md", workflow, sep="\n")
        return
    if a.cmd == "list":
        for manifest in sorted(projects.glob("*/project.toml")):
            status(manifest.parent)
            for item in sorted(manifest.parent.glob("goals/*/project.toml")):
                print("  goal", end=" ")
                status(item.parent)
        return
    p = projects / a.project
    if not re.fullmatch("[a-z0-9]+(?:-[a-z0-9]+)*", a.project) or not (p / "project.toml").is_file():
        parser.error("Unknown project. Use vediting list")
    library = p
    goal = a.slug if a.cmd == "goal" else getattr(a, "goal", None)
    if goal is not None:
        if not re.fullmatch("[a-z0-9]+(?:-[a-z0-9]+)*", goal):
            parser.error("Use a lowercase goal slug")
        p = library / "goals" / goal
        if a.cmd == "goal":
            p.mkdir(parents=True)
            for folder in FOLDERS:
                if folder in ("rushes", "assets", "work"):
                    (p / folder).symlink_to(Path("../..") / folder, target_is_directory=True)
                else:
                    (p / folder).mkdir()
            (p / "context.md").write_bytes((ROOT / "templates/project/context.md").read_bytes())
            (p / "project.toml").write_text(f'name = "{goal}"\nformat = "{a.format}"\nschema = 1\n')
            print(p / "context.md")
            return
        if not (p / "project.toml").is_file():
            parser.error("Unknown goal")
    if a.cmd in ("render", "handoff") and tomllib.loads((p / "project.toml").read_text())["format"] == "library":
        parser.error("Select an edit with --goal NAME")
    if a.cmd == "status":
        return status(p)
    if a.cmd == "prompts":
        if goal:
            print(prompts(library.name, goal))
        elif tomllib.loads((p / "project.toml").read_text())["format"] == "library":
            print(analysis_prompt(p.name))
        else:
            print(prompts(p.name))
        return
    for folder in FOLDERS:
        (p / folder).mkdir(exist_ok=True)
    with (p / "work/.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if a.cmd == "handoff":
            if not re.fullmatch(r"v[0-9]{4,}", a.version):
                parser.error("Pass a rendered version such as v0001")
            export_handoff(p, a.version, lambda _: inventory(library))
            return
        if a.cmd in ("review", "analyze", "transcribe", "prepare"):
            print(f"{library.name} · Inventaire des rushes…", flush=True)
        inv = inventory(library)
        print(f"{len(inv['clips'])} clips; inventory {inv['revision']}", flush=True)
        for path, reason in inv["errors"].items():
            print(path, reason)
        if a.cmd == "render":
            if Path(a.timeline).name != a.timeline:
                parser.error("Pass a timeline filename")
            render(p, p / "edit" / a.timeline, inv, ROOT)
        elif a.cmd in ("review", "analyze", "transcribe", "prepare"):
            clips = inv["clips"]
            keys = list(getattr(a, "ids", None) or clips)
            skip_graphics = getattr(a, "skip_graphics", False)
            if a.cmd == "transcribe" and skip_graphics:
                keys = [key for key in keys if not Path(clips[key]["source"]).is_relative_to("rushes/graphics")]

            started = monotonic()
            total = len(keys)
            print(f"{p.name} · {total} clip(s) à vérifier", flush=True)
            for index, key in enumerate(keys, start=1):
                clip_started = monotonic()
                r = clips[key]
                print(f"[{index}/{total}] {r['source']}", flush=True)
                dest = p / "work" / key / digest([r["size"], r["mtime_ns"], media.VIDEO_FILTER, media.FRAME_FILTER])
                dest.mkdir(parents=True, exist_ok=True)
                path = p / r["source"]
                if a.cmd in ("review", "analyze", "prepare"):
                    if a.cmd in ("analyze", "prepare") and not (dest / "moments.md").exists():
                        (dest / "moments.md").write_text(
                            f"# {r['source']}\n\nClip ID: {key}\n\n"
                            "Review pending. Record source in/out times, action, speakers, "
                            "searchable topics and any uncertainty here.\n"
                        )
                    if all((dest / f).exists() for f in ("proxy.mp4", "planche.html")):
                        print("  Proxy et planche déjà prêts", flush=True)
                    else:
                        print("  Génération du proxy et de la planche…", flush=True)
                        media.prepare(path, dest, f'0:{media.main_video(r["metadata"])["index"]}')
                if a.cmd in ("prepare", "transcribe"):
                    target = dest / f"transcript-{digest(a.model)}.json"
                    if skip_graphics and path.is_relative_to(p / "rushes/graphics"):
                        print("  Transcription ignorée pour ce graphique", flush=True)
                    elif target.exists():
                        print("  Transcription déjà prête", flush=True)
                    else:
                        print("  Transcription…", flush=True)
                        media.save_json(target, media.transcribe(path, dest, r["metadata"]["streams"], a.model, p))
                print(f"  Terminé en {monotonic() - clip_started:.1f} s · {total - index} restant(s)", flush=True)
            print(f"{total} clip(s) traité(s) en {monotonic() - started:.1f} s", flush=True)


def main():
    try:
        execute()
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as e:
        raise SystemExit(getattr(e, "stderr", "") or str(e)) from e
