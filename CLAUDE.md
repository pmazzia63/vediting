@AGENTS.md

## Claude Code

Start from the repository root. Use `/video-analyze PROJECT` to catalogue a collection's rushes, `/video-estimate PROJECT [GOAL]` to estimate runtime, `/video-edit PROJECT [GOAL]` to build or revise a cut, and `/timeline-handoff PROJECT vNNNN [GOAL]` for Resolve delivery. The bracketed goal is an optional slug.

Apply the shared goal rules when a skill uses single-film examples. For a named goal, read both briefs and the shared current inventory under the collection's `work/`. Write estimates and editorial decisions in the goal's `context.md`, and pass `--goal GOAL` to both `render` and `handoff`.

Use local contact sheets or timestamped stills with Claude's image reader. Review moving excerpts and listen locally when the session supports playback. Record which reviews actually happened and which remain pending. Reuse local timestamped transcripts for dialogue review.

Keep the edit and its delivery in the main session. When delegating, give a subagent the exact project, optional goal, and clip IDs or export version. Assign distinct clip IDs for simultaneous notes work and prepare shared media once before distributing review.

Use `bin/vediting` for named film workflows. The optional local FFmpeg MCP server supports targeted media operations. For FrameJam, use the installed integration in local mode when available and follow the project's local playback fallback otherwise. Keep external publication or sharing subject to the user's request.
