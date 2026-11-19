#!/usr/bin/env python3
"""Inventory, proxy, contact sheet and word-level transcription for local rushes."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from html import escape
import json
import os
from pathlib import Path
import re
import subprocess
from tempfile import TemporaryDirectory
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
MODEL = "mlx-community/whisper-small-mlx"
VIDEO_FILTER = "scale=w=1280:h=720:force_original_aspect_ratio=decrease:force_divisible_by=2"
FRAME_FILTER = "select=isnan(prev_selected_t)+gte(t-prev_selected_t\\,5),scale=320:-2,showinfo"


def run(*args):
    return subprocess.run(args, capture_output=True, text=True, check=True)


def save_json(path, value):
    with TemporaryDirectory(dir=path.parent) as temporary:
        draft = Path(temporary) / path.name
        draft.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        draft.replace(path)


def probe(path, root):
    result = run("ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path))
    metadata = json.loads(result.stdout)
    stat = path.stat()
    return {"source": os.path.relpath(path, root), "size": stat.st_size,
            "mtime_ns": stat.st_mtime_ns, "metadata": metadata}


def main_video(metadata):
    return next(stream for stream in metadata["streams"]
                if stream["codec_type"] == "video" and not stream["disposition"]["attached_pic"])


def prepare(path, dest, video_map):
    with TemporaryDirectory(dir=dest.parent) as temporary:
        staging = Path(temporary)
        proxy = staging / "proxy.mp4"
        frames_dir = staging / "images"
        frames_dir.mkdir()
        filters = (
            f"[{video_map}]split=2[proxy_input][sheet_input];"
            f"[proxy_input]{VIDEO_FILTER}[proxy];"
            f"[sheet_input]{FRAME_FILTER}[sheet]"
        )
        result = run("ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "info",
                     "-i", str(path), "-filter_complex", filters,
                     "-map", "[proxy]", "-map", "0:a:0?",
                     "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
                     "-fps_mode", "passthrough", "-c:a", "copy", "-movflags", "+faststart", str(proxy),
                     "-map", "[sheet]", "-an", "-fps_mode", "vfr",
                     "-q:v", "3", str(frames_dir / "%05d.jpg"))
        timestamps = re.findall(r"\bn:\s*\d+\s+pts:\s*-?\d+\s+pts_time:(\S+)", result.stderr)
        frames = sorted(frames_dir.glob("*.jpg"))
        if not frames or len(timestamps) != len(frames):
            raise ValueError(f"Horodatage incomplet pour {path.name}")
        figures = []
        for frame, timestamp in zip(frames, timestamps):
            figures.append(f'<figure><img src="images/{quote(frame.name)}" alt="">'
                           f'<figcaption>{float(timestamp):.3f} s</figcaption></figure>')
        title = escape(path.name)
        sheet = staging / "planche.html"
        sheet.write_text(
            '<!doctype html><html lang="fr"><meta charset="utf-8">'
            f'<title>{title}</title>'
            '<style>body{font:16px system-ui;background:#161616;color:#fff;margin:24px}'
            'main{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}'
            'figure{margin:0}img{width:100%;display:block}figcaption{padding:4px 0}</style>'
            f'<h1>{title}</h1><main>{"".join(figures)}</main></html>', encoding="utf-8")
        # Keep each new source revision isolated so an interrupted run can safely restart.
        dest.mkdir(exist_ok=True)
        final_images = dest / "images"
        final_images.mkdir(exist_ok=True)
        for frame in frames:
            frame.replace(final_images / frame.name)
        proxy.replace(dest / proxy.name)
        sheet.replace(dest / sheet.name)


def transcribe(path, dest, streams, model, root):
    audio = next((stream for stream in streams if stream["codec_type"] == "audio"), None)
    if audio is None:
        return {"source": os.path.relpath(path, root), "status": "sans piste audio"}
    try:
        import mlx_whisper
    except ModuleNotFoundError as error:
        if error.name != "mlx_whisper":
            raise
        raise ValueError("MLX Whisper manque dans le venv. Install the speech extra (see README.md).") from error
    except ImportError as error:
        if "No Metal device available" not in str(error):
            raise
        raise ValueError("MLX Whisper est installé. Ce terminal n’a pas accès à Metal. "
                         "Relancer la transcription dans Terminal sur le Mac.") from error
    with TemporaryDirectory(dir=dest) as temporary:
        wav = Path(temporary) / "audio.wav"
        run("ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", str(path),
            "-map", f"0:{audio['index']}", "-ac", "1", "-ar", "16000", str(wav))
        result = mlx_whisper.transcribe(str(wav), path_or_hf_repo=model, word_timestamps=True)
    return {"source": os.path.relpath(path, root), "model": model,
            "audio_stream_index": audio["index"], "audio_start_time": audio.get("start_time"),
            "timestamp_reference": "first decoded audio sample", **result}


