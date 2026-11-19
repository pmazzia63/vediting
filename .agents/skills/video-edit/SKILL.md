---
name: video-edit
description: Edit, resume, revise or deliver a vediting film from a named project's rushes, brief and timeline.
---

Read the [shared project workflow](../video-project/SKILL.md) for project selection, media review and transcript reuse.

## Edit and revise

When the brief includes a reference film, read [analyze-video-editing](../analyze-video-editing/SKILL.md). Analyze a representative range of the accessible reference, save the timecoded breakdown under `work/references/`, and carry relevant pacing, cutaway or sound ideas into the project's selects. Use local analysis and playback for private media.

Use the brief's target or a current estimate. Check its inventory revision after ingest. If the estimate is missing or stale, review the available coverage and choose a working duration consistent with the brief. Record that choice in Editorial decisions and continue through delivery.

Save `edit/selects.md` with timecodes, chapter, reason, uncertainties and sync notes. Create a numbered timeline JSON following `README.md`. For revisions start from the selected version's timeline snapshot in `review/vNNNN.json` and preserve earlier versions. Resolve each timecoded note with `bin/vediting locate PROJECT vNNNN TIME|START-END --goal GOAL` (revision prompts from the Studio Viewer already include these `↳` references) and edit the matching picture or audio entry. Set picture focus per shot for vertical framing. Use independent audio placements for continuous speech, ambience, music beds and cutaways. Check supplied music and its intended use with the brief. Build a representative short pilot for longer films by rendering a shorter timeline and moving its master to `review/pilot-N.mp4`. Retain its review report under a matching name.

For requested route maps, read [remotion-maps](../remotion-maps/SKILL.md) and use the workbench's graphics template. Render full-screen maps and titles as MP4s at the project preset size and cadence. Place them under `rushes/graphics/` with a new filename for each revision, then run `bin/vediting ingest PROJECT` and update the timeline's inventory revision after checking the media IDs.

Run `bin/vediting render PROJECT TIMELINE`. The renderer normalises the mix to the preset loudness target; do not add a separate loudness pass. Inspect the report's `loudness` block and duration. Review moving crops, transitions, audio joins and dialogue intelligibility using available playback or workbench tools. Correct issues and render a new version.

## Review and delivery

- For a requested screening or frame-level feedback, read [FrameJam](../framejam/SKILL.md) and open the versioned MP4 in local review mode when FrameJam is available. Record the reviewed export version and timecodes under Review feedback in `context.md`. Apply received notes to a new `vediting` timeline and add the next MP4 as a new review version. If FrameJam is unavailable, use local playback and record timecoded notes alongside the corresponding version. Complete delivery when screening was optional.
- For requested captions, read [captions-media-accessibility](../captions-media-accessibility/SKILL.md). Time cues against the final cut, check them against the locked mix, and verify spelling, speaker changes, meaningful location sounds, readability and sync. Use the FFmpeg tools for subtitle preparation or burn-in. Name sidecars by master version and language, for example `exports/v0002.fr.srt`, and recheck timing after picture or audio changes.
- For requested editable delivery, follow [timeline-handoff](../timeline-handoff/SKILL.md) after the chosen master has passed technical review. Include the handoff path, the corresponding master and any import checks still pending.

Record human-review gaps explicitly. Update Editorial decisions with chapter choices, current version, feedback applied and outstanding checks. Return the master, timecoded timeline, review paths and requested sidecars. Keep judgments made for this film in the project brief.
