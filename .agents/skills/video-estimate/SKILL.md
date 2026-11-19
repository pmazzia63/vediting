---
name: video-estimate
description: Estimate the runtime of a vediting film from its brief and camera rushes. Use for a recommended duration, a plausible range, or a timecoded chapter budget.
---

Read the [shared project workflow](../video-project/SKILL.md) for project selection, media review and transcript reuse.

Run `bin/vediting ingest PROJECT` and inspect `work/inventory.json`. Run `bin/vediting review PROJECT CLIP_ID …` across every story group. Inspect timestamped images, then moving excerpts around promising selects. Read cached transcripts for likely speech. Check stream offsets when translating transcript time into picture selects. Identify repeated takes, absent coverage and uncertain identities. Record what was actually watched or heard. Mark unavailable review as pending and reduce confidence accordingly.

Update only the Duration estimate section of `context.md`. For each beat give the source ID and time range, purpose, and lean and spacious screen times. Sum the columns, counting overlapping picture and speech once. Recommend a runtime, explain what a shorter cut would lose, and report coverage, confidence and any conflict with the user's target. Include the exact line “Inventory revision: REV” with the current revision substituted. With no footage, leave the estimate pending.

Return the recommended runtime, range, brief path and review limitations. Stop after the estimate.
