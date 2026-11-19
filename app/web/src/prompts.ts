import { timecode, type Note } from "./api";

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

export function revisionPrompt(agent: Agent, project: string, goal: string, version: string, notes: Note[]) {
  const head = agent === "claude" ? `/video-edit ${project} ${goal}` : `Use $video-edit for goal ${goal} in project ${project}.`;
  const lines = [...notes]
    .sort((a, b) => a.start - b.start)
    .filter((n) => n.text.trim())
    .map((n) => {
      const at = n.end !== null && n.end > n.start ? `${timecode(n.start)} → ${timecode(n.end)}` : timecode(n.start);
      return `- ${at} : ${n.text.trim().replace(/\n+/g, " ")}`;
    });
  return [
    head,
    `Révise ${version} avec ces retours (timecodes de l'export ${version}) :`,
    ...lines,
    `Consigne ces retours dans « Review feedback » du context.md du goal, puis livre une nouvelle version.`,
  ].join("\n");
}
