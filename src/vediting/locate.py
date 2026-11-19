"""Map export timecodes back to the shots, sources and words of a rendered version."""
import json
from fractions import Fraction
from pathlib import Path


def _words(project, clip, start, end):
    """Transcript words of a clip between two source times (seconds from the first audio sample)."""
    files = sorted((project / "work" / clip).glob("*/transcript-*.json"), key=lambda f: f.stat().st_mtime)
    if not files:
        return None
    words = []
    for segment in json.loads(files[-1].read_text()).get("segments", []):
        for word in segment.get("words", []):
            if word["end"] > start and word["start"] < end:
                words.append(word["word"])
    return "".join(words).strip()


def locate(project, version, spans, context=1.5):
    """Resolve each (start, end|None) span in seconds of export vNNNN to timeline entries."""
    report_path = project / "review" / f"{version}.json"
    if not report_path.is_file():
        raise ValueError(f"Missing render snapshot for {version}")
    report = json.loads(report_path.read_text())
    cut, fps = report["timeline"], Fraction(report["preset"]["fps"])
    total = sum(row["frames"] for row in cut["picture"])

    shots, position, chapter = [], 0, None
    for index, row in enumerate(cut["picture"], 1):
        chapter = row.get("chapter", chapter)
        shots.append((index, position, row, chapter))
        position += row["frames"]

    results = []
    for start, end in spans:
        first = min(max(int(Fraction(start) * fps), 0), total - 1)
        last = first if end is None else min(max(int(Fraction(end) * fps), first), total - 1)
        found = {"start": start, "end": end, "shots": [], "audio": []}
        for index, at, row, chapter in shots:
            if at <= last and first < at + row["frames"]:
                offset = max(first - at, 0)
                found["shots"].append({
                    "shot": index, "clip": row["id"], "chapter": chapter,
                    "timeline_in": round(float(at / fps), 3),
                    "source_in": round(float(row["in"]) + float(offset / fps), 3),
                    "source_range": [round(float(row["in"]), 3), round(float(row["in"] + row["frames"] / fps), 3)],
                })
        for index, row in enumerate(cut["audio"], 1):
            if row["at"] <= last and first < row["at"] + row["frames"]:
                offset = max(first - row["at"], 0)
                source = float(row["in"]) + float(offset / fps)
                entry = {"audio": index, "source_in": round(source, 3),
                         "gain_db": row.get("gain_db", 0)}
                if "asset" in row:
                    entry["asset"] = row["asset"]
                else:
                    entry["clip"] = row["id"]
                    span = float((last - max(first, row["at"])) / fps)
                    words = _words(project, row["id"], source - context, source + span + context)
                    if words:
                        entry["words"] = words
                found["audio"].append(entry)
        results.append(found)
    return results


def parse_span(text):
    start, _, end = text.partition("-")
    return float(start), (float(end) if end else None)


def describe(results):
    lines = []
    for r in results:
        at = f"{r['start']:.2f}s" + (f"–{r['end']:.2f}s" if r["end"] is not None else "")
        lines.append(at)
        for s in r["shots"]:
            lines.append(f"  shot {s['shot']} · clip {s['clip']} @ {s['source_in']}s"
                         + (f" · {s['chapter']}" if s["chapter"] else ""))
        for a in r["audio"]:
            name = a.get("asset") or f"clip {a['clip']}"
            lines.append(f"  audio {a['audio']} · {name} @ {a['source_in']}s · {a['gain_db']} dB"
                         + (f" · « {a['words']} »" if a.get("words") else ""))
    return "\n".join(lines)
