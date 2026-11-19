---
name: video-analyze
description: Catalogue vediting rushes in timestamped notes for each current clip revision. Use for collection analysis or dérushage before selecting an edit.
---

Use the project slug from the request or resolve it with `bin/vediting list`. Read the [shared project workflow](../../../.agents/skills/video-project/SKILL.md), `memory/editing.md`, and `projects/PROJECT/context.md`. Use the collection for shared footage even when the user names its edit goal.

1. Run `bin/vediting analyze PROJECT` and inspect `projects/PROJECT/work/inventory.json`. When the user requests a subset, pass the corresponding clip IDs. Locate each current revision's proxy, contact sheet, notes and any timestamped transcript.
2. Review each contact sheet and proxy where playback is available. Use timestamped stills from the proxy to examine promising excerpts when full playback is unavailable. Read cached transcripts and account for the audio stream offset when placing dialogue against picture. For likely speech without a transcript, use the local MLX workflow if available.
3. Update each current `work/CLIP/REVISION/moments.md` with source-relative in/out times, observable actions, people, topics, dialogue and promising moments. Include quiet cutaways and preserve human notes. Mark uncertain timestamps and identities, and record any missing transcript, playback or listening evidence.

Report the clip coverage, notes location and review limits. Stop after analysis.
