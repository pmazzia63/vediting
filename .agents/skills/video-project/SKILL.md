---
name: video-project
description: Shared project setup and media review for vediting. Routes existing video-project prompts to the duration estimate or editing skill.
---

Resolve the requested slug with `bin/vediting list`. If omitted and multiple projects exist, show formats and status and ask which one. Read `memory/editing.md` and the selected project's `project.toml` and `context.md`. Preserve the user's language, original rushes, human notes and earlier exports. Read the installed video-editing workbench workflow and quality gates for detailed media review.

For prompts that invoke `$video-project` directly, follow [video-estimate](../video-estimate/SKILL.md) for duration estimates or [video-edit](../video-edit/SKILL.md) for editing, resuming or revising a cut. If the request only names a project, ask which stage the user wants.

## Dialogue review

After copying rushes, prepare transcripts in Terminal on the Mac with the MLX environment active using `bin/vediting transcribe PROJECT --skip-graphics`. Both stages reuse `transcript-*.json` under the current clip revision in `work/`. For missing clips with likely speech, run `bin/vediting transcribe PROJECT CLIP_ID …` if MLX is available. Keep raw audio out of model inputs and tool results returned to the model. If MLX or Metal is unavailable and some transcripts are missing, continue with available evidence and record which clips still need transcription or listening. Report actual listening separately from transcript review.

## FFmpeg review tools

Read [ffmpeg-skill](../ffmpeg-skill/SKILL.md) before technical review. Use its `scripts/probe.py` for source or master inspection, `look.py` to inspect candidate shots and cut boundaries, `loudness.py` to measure the final mix, and `check.py` for delivery checks. Run each script with `--help` for its input contract. Record measurements and review findings alongside the version report. For reframing, B-roll, and targeted fixes use the corresponding skill recipes while keeping edit decisions in the project timeline.
