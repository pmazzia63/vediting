"""Export a rendered cut as an editable OpenTimelineIO timeline."""
import json
from fractions import Fraction
from pathlib import Path
from tempfile import TemporaryDirectory

from .media import main_video, probe
from .render import source_offset


def export_handoff(project, version, inventory):
    report_path = project / "review" / f"{version}.json"
    master = project / "exports" / f"{version}.mp4"
    if not report_path.is_file() or not master.is_file():
        raise ValueError(f"Missing render snapshot or master for {version}")
    output = master.with_suffix(".otio")
    if output.exists():
        print(output)
        return

    try:
        import opentimelineio as otio
    except ModuleNotFoundError as error:
        if error.name != "opentimelineio":
            raise
        raise ValueError("Install the handoff extra with python3 -m pip install -e '.[handoff]'") from error

    report = json.loads(report_path.read_text())
    cut, preset = report["timeline"], report["preset"]
    sources = report.get("sources")
    if sources is None:
        current = inventory(project)
        if current["revision"] != report["inventory_revision"]:
            raise ValueError("Legacy render requires the original inventory revision. Render a new version to hand off the current sources.")
        assets = {}
        for row in cut["audio"]:
            if "asset" in row and row["asset"] not in assets:
                path = (project / "assets" / row["asset"]).resolve()
                path.relative_to((project / "assets").resolve())
                assets[row["asset"]] = probe(path, project)
        sources = {"clips": current["clips"], "assets": assets}
        if assets:
            print(f"{version} predates asset fingerprints. Check audio assets against the master.")

    fps = Fraction(preset["fps"])

    def time_range(start, duration):
        return otio.opentime.TimeRange(
            otio.opentime.RationalTime(float(start), float(fps)),
            otio.opentime.RationalTime(float(duration), float(fps)),
        )

    verified = set()

    def clip(row, *, audio=False):
        record = sources["assets"][row["asset"]] if "asset" in row else sources["clips"][row["id"]]
        path = (project / record["source"]).resolve()
        if path not in verified:
            info = path.stat()
            if (info.st_size, info.st_mtime_ns) != (record["size"], record["mtime_ns"]):
                raise ValueError(f"Source changed since {version}: {record['source']}")
            verified.add(path)
        metadata = record["metadata"]
        container = metadata["format"]
        stream = (next(stream for stream in metadata["streams"] if stream["codec_type"] == "audio")
                  if audio else main_video(metadata))
        offset = source_offset(stream, container)
        start = max(0, Fraction(str(row["in"])) + offset)
        duration = container.get("duration")
        available = (Fraction(stream["duration"]) + offset
                     if duration in (None, "N/A") else Fraction(duration))
        return otio.schema.Clip(
            name=path.name,
            source_range=time_range(start * fps, row["frames"]),
            media_reference=otio.schema.ExternalReference(
                target_url=path.as_uri(), available_range=time_range(0, available * fps),
            ),
            metadata={"vediting": {"placement": row, "stream_index": stream["index"]}},
        )

    timeline = otio.schema.Timeline(
        name=f"{project.name} {version}",
        global_start_time=otio.opentime.RationalTime(0, float(fps)),
        metadata={"vediting": {"preset": preset, "reference_master": master.name}},
    )
    picture = otio.schema.Track(name="Picture", kind=otio.schema.TrackKind.Video)
    timeline.tracks.append(picture)
    cursor, chapter = 0, None
    for row in cut["picture"]:
        label = row.get("chapter")
        if label and label != chapter:
            picture.markers.append(otio.schema.Marker(name=label, marked_range=time_range(cursor, 0)))
            chapter = label
        picture.append(clip(row))
        cursor += row["frames"]

    audio_tracks = []
    for row in sorted(cut["audio"], key=lambda row: row["at"]):
        at = row["at"]
        lane = next((i for i, (_, end) in enumerate(audio_tracks) if end <= at), len(audio_tracks))
        if lane == len(audio_tracks):
            track = otio.schema.Track(name=f"Audio {lane + 1}", kind=otio.schema.TrackKind.Audio)
            timeline.tracks.append(track)
            audio_tracks.append((track, 0))
        track, end = audio_tracks[lane]
        if end < at:
            track.append(otio.schema.Gap(source_range=time_range(0, at - end)))
        track.append(clip(row, audio=True))
        audio_tracks[lane] = track, at + row["frames"]

    with TemporaryDirectory(dir=output.parent) as temporary:
        draft = Path(temporary) / output.name
        otio.adapters.write_to_file(timeline, str(draft))
        draft.replace(output)
    print(output)
