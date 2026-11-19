import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { CLI, HttpError, ROOT, projectDir, python, slug } from "./paths.ts";
import { broadcast } from "./events.ts";

export type Job = {
  id: string;
  project: string;
  cmd: string;
  args: string[];
  status: "running" | "done" | "failed" | "cancelled";
  index: number;
  total: number;
  clip: string;
  step: string;
  log: string[];
  started: number;
  finished: number | null;
  clipStarted: number;
  durations: number[];
  code: number | null;
};

const ALLOWED = new Set(["ingest", "analyze", "prepare", "review", "transcribe"]);
const jobs = new Map<string, Job>();
const procs = new Map<string, ChildProcess>();

export function publicJob(j: Job) {
  const avg = j.durations.length ? j.durations.reduce((a, b) => a + b, 0) / j.durations.length : null;
  const remaining = j.total ? j.total - j.durations.length : 0;
  return { ...j, log: j.log.slice(-400), eta: avg !== null ? Math.round(avg * remaining) : null };
}

export function listJobs(project?: string) {
  return [...jobs.values()].filter((j) => !project || j.project === project).sort((a, b) => b.started - a.started).map(publicJob);
}

function parse(job: Job, line: string) {
  let m: RegExpMatchArray | null;
  if ((m = line.match(/^\[(\d+)\/(\d+)\]\s+(.*)$/))) {
    job.index = Number(m[1]);
    job.total = Number(m[2]);
    job.clip = m[3];
    job.step = "Vérification";
    job.clipStarted = Date.now();
  } else if ((m = line.match(/·\s*(\d+) clip\(s\) à vérifier/))) {
    job.total = Number(m[1]);
    job.step = "Démarrage";
  } else if (/Inventaire des rushes/.test(line)) {
    job.step = "Inventaire des rushes";
  } else if ((m = line.match(/^(\d+) clips; inventory/))) {
    job.step = `${m[1]} clips reconnus`;
  } else if ((m = line.match(/Terminé en ([\d.]+) s/))) {
    job.durations.push(Number(m[1]));
    job.step = "Clip terminé";
  } else if (/^\s+\S/.test(line)) {
    job.step = line.trim().replace(/…$/, "");
  }
}

export function startJob(project: unknown, cmd: unknown, opts: { skipGraphics?: boolean; ids?: string[] } = {}) {
  const p = slug(project, "project");
  projectDir(p);
  if (typeof cmd !== "string" || !ALLOWED.has(cmd)) throw new HttpError(400, "Unknown command");
  if ([...jobs.values()].some((j) => j.project === p && j.status === "running")) {
    throw new HttpError(409, "Une tâche est déjà en cours sur ce projet.");
  }
  const args = [cmd, p];
  if (Array.isArray(opts.ids)) args.push(...opts.ids.map((id) => slug(id, "clip id")));
  if (opts.skipGraphics && (cmd === "prepare" || cmd === "transcribe")) args.push("--skip-graphics");

  const job: Job = {
    id: randomUUID(),
    project: p,
    cmd,
    args,
    status: "running",
    index: 0,
    total: 0,
    clip: "",
    step: "Lancement",
    log: [`$ bin/vediting ${args.join(" ")}`],
    started: Date.now(),
    finished: null,
    clipStarted: Date.now(),
    durations: [],
    code: null,
  };
  jobs.set(job.id, job);
  const child = spawn(python(), [CLI, ...args], { cwd: ROOT, env: { ...process.env, PYTHONUNBUFFERED: "1" } });
  procs.set(job.id, child);

  let buffer = "";
  let pending: NodeJS.Timeout | null = null;
  const emit = () => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      broadcast({ type: "job", job: publicJob(job) });
    }, 150);
  };
  const onData = (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n|\r/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      job.log.push(line);
      if (job.log.length > 2000) job.log.splice(0, job.log.length - 2000);
      parse(job, line);
    }
    emit();
  };
  child.stdout!.on("data", onData);
  child.stderr!.on("data", onData);
  child.on("error", (e) => {
    job.log.push(String(e));
  });
  child.on("close", (code) => {
    if (buffer.trim()) job.log.push(buffer.trim());
    procs.delete(job.id);
    job.code = code;
    job.finished = Date.now();
    if (job.status === "running") job.status = code === 0 ? "done" : "failed";
    job.step = job.status === "done" ? "Terminé" : job.status === "cancelled" ? "Annulé" : "Échec";
    broadcast({ type: "job", job: publicJob(job) });
    broadcast({ type: "fs", project: p });
  });
  broadcast({ type: "job", job: publicJob(job) });
  return publicJob(job);
}

export function cancelJob(id: string) {
  const job = jobs.get(id);
  const proc = procs.get(id);
  if (!job || !proc) throw new HttpError(404, "No running job");
  job.status = "cancelled";
  proc.kill("SIGINT");
  return { ok: true };
}

export function killAll() {
  for (const p of procs.values()) p.kill("SIGINT");
}
