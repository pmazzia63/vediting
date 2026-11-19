---
name: timeline-handoff
description: Export an editable OpenTimelineIO timeline from a rendered vediting version for finishing in DaVinci Resolve.
---

Resolve the project and rendered version with `bin/vediting list` and the project's export history. Run `bin/vediting handoff PROJECT vNNNN` from the checkout. The command uses the saved render snapshot and writes `exports/vNNNN.otio` next to the matching reference MP4. It returns an existing handoff for the same version. The README documents the optional Python dependency.

The OTIO references the local media files and carries picture cuts, chapter markers, and independent audio track placements. Keep the source files available for relink. Crop focus, gain, fades, and source stream mapping are stored in metadata for manual conform. Check them in Resolve against the reference MP4, along with framing, chapter points, audio sync, and cut timing. Camera start timecode and source stream selection may require adjustment in the receiving editor.

Deliver the OTIO and the reference MP4 paths. Record what was checked in the project brief and identify any import or playback checks still pending. Keep manual finishing decisions tied to the exported version.
