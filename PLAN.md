# vediting repository plan

## The everyday workflow

From the repository root, run `bin/vediting new "Japan by train" --format youtube`. Copy camera MP4s into the printed rushes folder, including card subfolders, and fill in `context.md`. Run the printed `bin/vediting transcribe japan-by-train --skip-graphics` command in Terminal with the MLX environment active. Use the estimate prompt in Codex, then use the edit prompt when ready. Both prompts reuse the local transcripts.

**Duration prompt**

> Use $video-estimate for japan-by-train. Use the cached timestamped transcripts for dialogue review. Save a timecoded duration budget in context.md and stop there.

**Editing prompt**

> Use $video-edit for japan-by-train. Use the cached timestamped transcripts for dialogue review. Follow the brief, review the cut and deliver a versioned master.

With just `$video-edit`, show project names, formats and status. Ask which project to open when several are eligible. An explicit slug always selects exactly one project. Later, “shorten the station sequence in japan-by-train” should reopen the last timeline and produce a new version.

When the brief calls for a reference analysis, animated route, frame-specific screening, accessible captions or editable handoff, use the companion skill during the corresponding edit or delivery stage. Keep the numbered `vediting` timeline as the source for revisions. See the [film workflow](README.md#film-workflow) for the skills and outputs.

## Proposed repository

~~~text
AGENTS.md                       How Codex resolves project, memory and stage
README.md                       Setup and first film walkthrough
memory/editing.md               Your standing preferences and editing principles
presets/{reel,youtube}.toml      Canvas, frame rate policy, mix and export defaults
.agents/skills/video-project/   Shared project setup and transcript reuse
.agents/skills/video-estimate/  Duration assessment and timecoded budget
.agents/skills/video-edit/      Editing, revisions and delivery
.agents/skills/video-editing/   Pinned Scotland workbench and references
skills-lock.json                Source, revision and integrity of imported skill
pyproject.toml                  Python CLI entry point and dependency groups
src/vediting/                   Project creation, ingest, timeline, render and QC
templates/project/              Initial brief, manifest and folder skeleton
tests/fixtures/                 Tiny generated media and expected timeline data
projects/<slug>/
  project.toml                  Display name, format and schema version
  context.md                    Story, priorities, constraints, estimate and decisions
  rushes/                       Original camera files, grouped however you copy them
  assets/                       Supplied music, maps, title art and captions
  work/                         Inventory, proxies, contact sheets, transcripts and cache
  edit/                         Timecoded selects, chapter plan and versioned timelines
  review/                       Pilot, review notes and per-version QC results
  exports/                      Versioned delivery files
~~~

Track briefs, configuration, editorial decisions and timelines in Git. Ignore rushes, private media assets, derived media, transcripts and exports by default. Store paths relative to the project. Keep shared preferences editable in one place. Project instructions override a general preference. Put feedback from one screening in the project brief until the user asks to apply it across films.

## What to extract from Scotland

| Existing component in scotland_montage | Reuse and required change |
| --- | --- |
| AGENTS.md and MONTAGE.md | Keep the short agent entry point leading to one human-readable project memory. Extract approved preferences about interactions, patient shots and location sound. Keep the twenty-minute target, itinerary and search for Elise in Scotland’s brief. |
| scripts/derush.py | Preserve inventory, native-cadence 720p proxies with audio, timed HTML contact sheets, word-level MLX Whisper transcripts, audio stream offsets and cache reuse. Pass project paths explicitly. Include source-relative path in asset identity so two cards can both contain C0001.MP4. |
| scripts/monter_film.py | Keep source-change checks, bounds checks, rational frame arithmetic, chapter positions, segment rendering and assembly. Replace DJI filename parsing, fixed 30000/1001 cadence, Glasgow pilot dependency and film-v1 paths with manifest and timeline inputs. |
| .agents/skills/video-editing and skills-lock.json | Start from the exact locked revision 8b633c2d698410e523f95335aa6433766264cc7f. Reuse video_workbench.py, editorial-plan template, workflow and quality gates. Inspect license and dependency requirements before redistribution. Use the included Remotion template when an edit calls for graphics. |
| derushage/pilote, film-v1 and reel-work-song | Use the pilot, long-form selections and separate reel revisions as reference cases. Compare timing, framing, source sound and review artifacts on representative excerpts. |

Use the FFmpeg skill for probing, reframing, levels and delivery checks where it already provides the operation. Keep one authoritative timeline and renderer. Codex handles story judgment and the CLI handles repeatable media operations. The estimate and edit skills share the project brief, inventory and transcripts so every decision lands in the same project.

## Memory and editorial practice

Start context.md with freeform user notes, audience, intended feeling, chronology, people and places to emphasize, mandatory moments, material to exclude, language, music, deliverable and any fixed duration. Codex owns clearly marked sections for footage coverage, duration estimate, decisions, unresolved questions and latest cut. Update those sections in place and preserve the user’s wording.

Seed shared memory with the following proposed defaults, which can be adjusted after viewing the first projects.

- Build around moments with a reason to stay. Give a glance, laugh or landscape enough time to register. Trim repeated coverage once it stops adding information.
- When a speaker continues over a picture edit, put the full spoken phrase on its own audio track. Cover the visual join with a relevant reaction, detail or location shot. Return on a natural gesture or pause. Listen across both joins with the screen off. If the spoken recording itself has a gap, find a natural phrase boundary and matching room tone. An insert alone cannot repair missing words.
- Let the next location’s sound begin just before its picture when it helps orientation. Let meaningful dialogue or ambience carry over a cut when it connects two shots. Preserve the speaker’s meaning and believable spatial continuity.
- Check uncertain words against the recording. Inspect movement around both ends of each select. A thumbnail can locate a face but cannot tell whether the shot settles or the reaction finishes.
- Let music yield to conversation. Keep characteristic location sound audible. Introduce dates, maps and titles when the viewer needs orientation. For a travel film, settle the story before polishing graphics, as in Scotland.
- For a reel, identify one central moment and check each vertical crop in motion. For YouTube, use chapters when the material supports them and leave space for longer scenes. Proposed project presets are 1080×1920 and 1920×1080 respectively. Format alone never determines running time.

## Estimating runtime

Inventory the entire folder first. Group material by the brief’s story beats, using recording time as a clue and noting uncertain chronology. Review contact sheets across every group. Listen to likely dialogue and inspect motion for anchor scenes. Mark duplicate angles, unusable passages, missing coverage and unreviewed clips. For an empty folder, leave the estimate pending and show the ingest path.

Budget each beat from actual unique selections. Count a twelve-second quote covered by four seconds of B-roll as twelve seconds. Add standalone establishing shots, reactions, pauses and titles only where they extend the timeline. Record a lean and a spacious version, sum each column, then recommend a target and explain the editorial tradeoff. Each row needs a beat, example source ranges, mandatory material and estimated screen time. Record inventory revision and coverage so new footage can mark the estimate stale. Preserve a user-set target and explain any conflict with the material.

## Execution and recovery

1. **Create.** Validate format, normalize the display name to a safe slug, and refuse collisions before writing. Print the next command and prompt. Expose list and status commands for returning projects.
2. **Ingest.** Discover MP4s case-insensitively and recursively. Probe streams, orientation, duration, cadence and audio start time. Save an inventory with stable IDs. Report unreadable clips individually. Preserve usable silent clips. Never modify originals.
3. **Review.** Generate proxies and contact sheets, then transcribe dialogue candidates. Record visual and audio observations against source timecodes. Preserve the distinction between a person identified in the brief and an uncertain sighting. Scope expensive work to changed files. Report unavailable transcription models and retain completed visual analysis.
4. **Select and assemble.** Write selects with asset ID, in/out, reason and chapter. The timeline records rational output cadence, frame positions, independent video and audio placements, crop, gain, fades and source offsets. Allow picture inserts over continuous audio. Validate source bounds, gap handling and total duration before rendering.
5. **Pilot and revise.** For a longer film, render one representative scene with speech, ambience and a picture cutaway. Fold any user feedback into context.md. Continue with the existing brief when the user asked for a full cut. Keep previous timelines so later feedback can target a chapter or timecode.
6. **Finish and deliver.** Render masters from original sources. Record preset, timeline revision, tool versions and input fingerprints. Check decode, dimensions, duration, stream presence, sync and levels. Inspect moving footage at joins and crops, and listen to dialogue under music. Record which checks actually ran and anything still requiring human review.
7. **Resume.** Write artifacts atomically. Cache by source fingerprint, tool settings and model version. A changed rush invalidates its derivatives and affected timeline segments. A changed crop invalidates its render without rerunning transcription. Lock concurrent writes to one project. Keep a failed render separate from the last successful export.

## Implementation milestones and acceptance

| Order | Deliverable | Demonstration |
| --- | --- | --- |
| 1 | CLI skeleton, shared memory, project template, presets and selector | Create one reel and one YouTube project. Reopen each in a fresh session. Duplicate creation leaves the original brief intact. |
| 2 | Adapt Scotland ingest and review tooling | Import nested cards containing identical filenames, silent footage and a rotated clip. Run twice, confirm unchanged proxies are reused, replace one clip and verify selective invalidation. |
| 3 | Estimate skill and editable context | Produce a timecoded chapter budget for a Scotland excerpt. Check summed runtime and overlapping audio. Rerun after adding footage and verify handwritten notes survive. |
| 4 | Timeline and renderer | Recreate a representative pilot sequence. Put B-roll over continuous dialogue, verify source audio alignment and chapter boundaries, then interrupt and resume a render. |
| 5 | Reel and YouTube delivery, QC and revisions | Export both formats from sample rushes. Review the moving crop and intelligibility. Request one shorter beat and recover both the first and revised export from their timelines. |
| 6 | End-to-end trial | Start a genuinely new trip using only its name, format, copied rushes and brief. Complete estimation and delivery from the two prompts without editing Python, inserting machine-specific paths or referring back to the Scotland folder. |

The first milestone worth using on real footage is 3. It delivers project creation, reusable memory and an evidence-based duration estimate while the renderer is being generalized. The full workflow is ready after milestone 6.
