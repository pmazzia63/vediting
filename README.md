# vediting

## Claude Code setup

Run `bin/install-workbench` from the repository root, then start `claude` there. [CLAUDE.md](CLAUDE.md) imports the shared [AGENTS.md](AGENTS.md) instructions. The links under `.claude/skills/` point to the shared project skills. The installer populates the optional companion skills at their pinned revisions.

| Task | Claude Code command |
| --- | --- |
| Catalogue the collection's rushes | `/video-analyze japan-by-train` |
| Estimate a film or named goal | `/video-estimate japan-by-train station-breakfast` |
| Edit or revise a film or named goal | `/video-edit japan-by-train station-breakfast` |
| Export a cut to Resolve | `/timeline-handoff japan-by-train v0001 station-breakfast` |

Omit the goal slug for a single-film project. The `/agents` menu lists the project's footage analyst, runtime estimator and delivery reviewer. The main session handles the edit and its delivery.

Claude Code can enable the bundled local FFmpeg MCP server from `.mcp.json`. Check its status with `/mcp`. For FrameJam screening, install the optional Claude integration with `npx -y framejam install claude` and start a new session. [FrameJam setup](https://www.framejam.ai/docs/install).

## Local interface (vediting Studio)

`bin/vediting-app` builds the interface if needed, starts it on http://127.0.0.1:5178 and opens the browser (Node 22+ required, first run installs `app/node_modules`). For development, run `npm --prefix app run dev` and open http://127.0.0.1:5179.

- **Projets**: list and create collections (`bin/vediting new`).
- **Projet**: open `rushes/` in the Finder, run the analysis (`ingest`) and the preparation (`prepare`) with live progress, send `/video-analyze` to the terminal, create videos (goals), edit their `context.md`, then estimate or generate.
- **Visionneuse**: detects new `exports/vNNNN.mp4` files, frame-accurate playback (←/→ frame, I/O range, N note), notes saved in `review/vNNNN-notes.json`, and a revision prompt to copy or send to the terminal.
- **Terminal**: Claude Code or Codex (or zsh) at the repository root, kept alive across pages (⌘J to toggle).

The server listens on 127.0.0.1 only and rejects other hosts and origins. Set `VEDITING_PYTHON` to choose the interpreter (default `.venv/bin/python`, which carries MLX for transcription) and `PORT` to change the port.

## One collection, several edits

```sh
bin/vediting new "Japan by train"
# Copy camera MP4s into projects/japan-by-train/rushes/
bin/vediting prepare japan-by-train --skip-graphics
```

With MLX active in your Mac Terminal, `prepare` inventories the rushes and prepares the proxy, contact sheet and transcript clip by clip. It reports progress and reuses completed outputs. `--skip-graphics` skips transcription for generated graphics. Use `analyze` alone for visual preparation without MLX.

Run `/video-analyze japan-by-train` in Claude Code or ask Codex to “Analyze the Japan by train footage and catalogue the moments.” The CLI prepares proxies, contact sheets and a notes file per clip revision. The assistant reviews the footage and records timecoded observations in those files. Search the descriptions and transcripts with `rg -i 'station' projects/japan-by-train/work -g moments.md -g 'transcript-*.json'`.

```sh
bin/vediting goal japan-by-train train-story --format youtube
bin/vediting goal japan-by-train station-breakfast --format reel
```

Give each goal a brief in `projects/japan-by-train/goals/GOAL/context.md`, or describe it in your session. Ask “Edit the station-breakfast goal using the shared footage analysis.” Each goal has its own estimate, selects, timeline, reviews and versioned exports. To render its timeline, use `bin/vediting render japan-by-train timeline.json --goal station-breakfast`. Add goals to existing projects the same way.

## Single-film workflow

Create a film workspace, drop in camera clips, then use Claude Code or Codex to estimate and edit. Python 3.11+, FFmpeg and ffprobe on PATH are required. From this checkout run:

~~~sh
bin/vediting new "Japan by train" --format youtube
~~~

Use `--format reel` for vertical output. Copy your MP4s into the printed `rushes/` folder and fill in `context.md`. Then follow the steps printed by `new`. Retrieve them later with `bin/vediting prompts japan-by-train`.

1. **Transcribe in Terminal on the Mac.** With the MLX environment active, run `bin/vediting transcribe japan-by-train --skip-graphics`. Rerun it after adding rushes to reuse the existing transcripts and process new clips.
2. **Estimate the runtime.** Use `/video-estimate japan-by-train` in Claude Code or `$video-estimate japan-by-train` in Codex to write a recommended runtime, range, and timecoded chapter budget in `context.md`.
3. **Edit when ready.** Use `/video-edit japan-by-train` in Claude Code or `$video-edit japan-by-train` in Codex to build and review a cut, then deliver a versioned master and timeline. This also works directly from a brief with a target runtime.

Add this checkout's bin directory to PATH to use `vediting` directly, or install editable with `python3 -m pip install -e .` in a virtual environment. Use an editable install so project files live in this checkout.

Run `bin/install-workbench` on a new clone or to add missing skills to an existing checkout. It installs the pinned Scotland workbench and companion skills from `skills-lock.json` into `.agents/skills/`. For speech on Apple Silicon, activate a virtual environment and install the optional dependency with `python -m pip install -e '.[speech]'`. You can also use an existing MLX Whisper environment by running its `bin/python` with `bin/vediting transcribe japan-by-train --skip-graphics` as arguments. First transcription requires a model download or a local model path via `--model`. The rest of the CLI works without MLX.

`bin/vediting transcribe PROJECT --skip-graphics` prepares transcripts for the camera footage and excludes generated clips under `rushes/graphics/`. Transcription reuses cached results for the same source revision and model. To process only likely speech, run `bin/vediting ingest PROJECT` and pass the relevant clip IDs from `work/inventory.json`. Omit `--skip-graphics` to include generated clips. The command prints each output directory under `projects/PROJECT/work/`, where `transcript-*.json` contains timestamped text and the audio stream offset for dialogue review. If MLX cannot access Metal in the assistant's session, run the command in Terminal on the Mac.

~~~sh
bin/vediting list
bin/vediting status japan-by-train
bin/vediting ingest japan-by-train
bin/vediting review japan-by-train
bin/vediting transcribe japan-by-train CLIP_ID
bin/vediting render japan-by-train v001.json
~~~

Inventory records are keyed by ID in work/inventory.json. Review generates 720p proxies and timecoded HTML sheets per source revision. Supply selected IDs to review or transcribe to limit work. The entire `projects/` directory stays outside Git, including briefs, notes, timelines, media and exports. Back up that directory separately. Global preferences live in memory/editing.md. Each project's brief overrides defaults. See PLAN.md for editorial intent.

## Film workflow

Existing `$video-project` prompts still route to the estimate or edit skill. During editing and delivery the project brief controls which companion skills apply.

| Stage | Skill and output |
| --- | --- |
| Reference and selects | `analyze-video-editing` breaks down a supplied reference into timecoded observations under `work/references/`. |
| Graphics | `remotion-maps` builds animated routes with the workbench's Remotion template. Render each map into `rushes/graphics/` and re-ingest to add it to the timeline. |
| Screening and revisions | `framejam` lets you annotate a local versioned MP4 by frame. Record its version and notes in `context.md` before applying feedback to a new edit. The skill is local to the repo. The review UI needs the separate [FrameJam setup](https://www.framejam.ai/docs/install) and Node 22+. |
| Caption delivery | `captions-media-accessibility` checks requested captions against the final picture and mix. Use the FFmpeg tools for subtitle preparation or burn-in and version any delivered sidecars with the master. |
| Editable delivery | `timeline-handoff` exports an editable cut for Resolve alongside the checked MP4. |

For editable handoff, activate the project environment and install `python3 -m pip install -e '.[handoff]'`. Export the selected master version with `bin/vediting handoff japan-by-train v0001`. The resulting `exports/v0001.otio` references the local source files and includes the picture cut, chapter markers and separate overlapping audio placements. Keep the matching MP4 for checking the import. Crop focus, gain, fades and source stream mapping are carried as metadata for manual conform. Verify timing, relinks and sync in Resolve. Legacy render snapshots require their original rushes inventory revision and a manual check of any audio assets.

## Timeline contract

Save edit/v001.json in the project. Replace the revision and IDs with actual inventory values. Picture entries play sequentially. Each source in-point uses seconds from the first sample of its stream. Frames and audio placements use the preset frame rate. In this example the first speaker remains audible through the entire second shot.

~~~json
{
  "inventory_revision": "REV",
  "picture": [
    {"id":"SPEAKER","in":1,"frames":60,"chapter":"Arrival"},
    {"id":"STATION","in":0,"frames":30,"focus":[0.6,0.5]}
  ],
  "audio": [
    {"id":"SPEAKER","in":1,"frames":90,"at":0,"gain_db":0,"fade_out":0.05}
  ]
}
~~~

For music or room tone put a file in assets/ and use "asset" with its relative filename in place of "id". Audio entries can overlap. Use gain_db and fade_in/fade_out (seconds) for the mix. An empty audio list produces silence. Render rechecks inventory, reuses finished picture segments, creates exports/vNNNN.mp4 and saves the timeline snapshot, source fingerprints, measured levels, stream metadata and encoder version under review/. Machine checks cover decoding, frame count, dimensions and duration. Codex records editorial review separately. After replacing source media, review its timecodes before updating the timeline revision.

Run the integration test with `python3 -m unittest discover -s tests`. It uses temporary synthetic clips and an isolated checkout.

The Scotland workflow also used the machine-installed ffmpeg-skill. A local copy, including its license and scripts, now lives under .agents/skills/ffmpeg-skill so its inspection and delivery tools travel with this repository.
