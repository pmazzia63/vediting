import { timecode, type Located, type Note } from "./api";

export type Agent = "claude" | "codex";

/** Prompts mirror prompts() and analysis_prompt() in src/vediting/cli.py. */
export function analyzePrompt(agent: Agent, project: string) {
  return agent === "claude"
    ? `/video-analyze ${project}`
    : `Analyze the footage in ${project} and complete the current moments.md files.`;
}

export function estimatePrompt(agent: Agent, project: string, goal: string) {
  const head = agent === "claude" ? `/video-estimate ${project} ${goal}` : `Use $video-estimate for goal ${goal} in project ${project}.`;
  return `${head}\nUse the cached timestamped transcripts for dialogue review. Save a timecoded duration budget in the selected brief and stop there.`;
}

export function editPrompt(agent: Agent, project: string, goal: string) {
  const head = agent === "claude" ? `/video-edit ${project} ${goal}` : `Use $video-edit for goal ${goal} in project ${project}.`;
  return `${head}\nUse the cached timestamped transcripts for dialogue review. Follow the brief, review the cut and deliver a versioned master.`;
}

/** Short source reference for a note, from `bin/vediting locate`. */
export function sourceLine(found: Located | undefined) {
  if (!found) return "";
  const shots = found.shots.map((s) => `plan ${s.shot} · clip ${s.clip} @ ${s.source_in.toFixed(2)} s${s.chapter ? ` (${s.chapter})` : ""}`);
  const audio = found.audio.map((a) => `audio ${a.audio} · ${a.asset ?? `clip ${a.clip}`} @ ${a.source_in.toFixed(2)} s${a.words ? ` « ${a.words} »` : ""}`);
  return [...shots, ...audio].join(" ; ");
}

export function revisionPrompt(agent: Agent, project: string, goal: string, version: string, notes: Note[], located: Record<string, Located> = {}) {
  const head = agent === "claude" ? `/video-edit ${project} ${goal}` : `Use $video-edit for goal ${goal} in project ${project}.`;
  const lines = [...notes]
    .sort((a, b) => a.start - b.start)
    .filter((n) => n.text.trim())
    .map((n) => {
      const at = n.end !== null && n.end > n.start ? `${timecode(n.start)} → ${timecode(n.end)}` : timecode(n.start);
      const where = sourceLine(located[n.id]);
      return `- ${at} : ${n.text.trim().replace(/\n+/g, " ")}${where ? `\n  ↳ ${where}` : ""}`;
    });
  return [
    head,
    `Révise ${version} avec ces retours (timecodes de l'export ${version}, ↳ = plans et sources résolus depuis review/${version}.json) :`,
    ...lines,
    `Consigne ces retours dans « Review feedback » du context.md du goal, puis livre une nouvelle version.`,
  ].join("\n");
}
