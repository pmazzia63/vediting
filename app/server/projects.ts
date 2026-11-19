import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import { HttpError, PROJECTS, ROOT, VERSION, projectDir } from "./paths.ts";
import { runCli } from "./run.ts";

const PENDING = "Review pending.";
const VIDEO = /\.(mp4|mov|m4v|mxf|avi|mkv)$/i;

type Manifest = { name: string; format: string };

function manifest(dir: string): Manifest {
  const data = parseToml(readFileSync(path.join(dir, "project.toml"), "utf8")) as Record<string, unknown>;
  return { name: String(data.name ?? path.basename(dir)), format: String(data.format ?? "library") };
}

function readJson(file: string): any {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function dirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

function walk(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full));
  }
  return out.sort();
}

function exportsOf(dir: string): string[] {
  try {
    return readdirSync(path.join(dir, "exports")).filter((f) => /^v[0-9]{4,}\.mp4$/.test(f)).sort();
  } catch {
    return [];
  }
}

/** Mirrors status() in src/vediting/cli.py. */
function stage(dir: string, fmt: string, revision: string): string {
  if (fmt === "library") return revision ? "ingested" : "copy rushes / ingest";
  if (!revision) return "copy rushes / ingest";
  const ctx = existsSync(path.join(dir, "context.md")) ? readFileSync(path.join(dir, "context.md"), "utf8") : "";
  return ctx.includes(`Inventory revision: ${revision}`) ? "edit" : "estimate";
}

/** The newest prepared revision folder of a clip under work/ID/. */
function clipState(work: string, id: string) {
  const base = path.join(work, id);
  const revs = dirs(base).map((r) => ({ r, t: statSync(path.join(base, r)).mtimeMs })).sort((a, b) => b.t - a.t);
  if (!revs.length) return { prepared: false, transcript: false, moments: "missing" as const, rev: null };
  const dest = path.join(base, revs[0].r);
  const files = readdirSync(dest);
  const momentsFile = path.join(dest, "moments.md");
  const moments = !existsSync(momentsFile) ? "missing" : readFileSync(momentsFile, "utf8").includes(PENDING) ? "pending" : "done";
  return {
    prepared: files.includes("proxy.mp4") && files.includes("planche.html"),
    transcript: files.some((f) => /^transcript-.*\.json$/.test(f)),
    moments,
    rev: revs[0].r,
  };
}

function goalSummary(projectPath: string, slug: string, revision: string) {
  const dir = path.join(projectPath, "goals", slug);
  const m = manifest(dir);
  const ex = exportsOf(dir);
  return { slug, format: m.format, stage: stage(dir, m.format, revision), exports: ex, latest: ex.at(-1) ?? null };
}

export function listProjects() {
  if (!existsSync(PROJECTS)) return [];
  return dirs(PROJECTS)
    .filter((d) => existsSync(path.join(PROJECTS, d, "project.toml")))
    .map((slug) => {
      const dir = path.join(PROJECTS, slug);
      const m = manifest(dir);
      const inv = readJson(path.join(dir, "work/inventory.json"));
      const revision = inv?.revision ?? "";
      const goals = dirs(path.join(dir, "goals")).filter((g) => existsSync(path.join(dir, "goals", g, "project.toml")));
      const latest = goals
        .flatMap((g) => exportsOf(path.join(dir, "goals", g)).map((v) => ({ g, v, t: statSync(path.join(dir, "goals", g, "exports", v)).mtimeMs })))
        .sort((a, b) => b.t - a.t)[0];
      return {
        slug,
        name: m.name,
        format: m.format,
        clips: inv ? Object.keys(inv.clips ?? {}).length : null,
        rushes: walk(path.join(dir, "rushes")).filter((f) => VIDEO.test(f)).length,
        stage: stage(dir, m.format, revision),
        goals: goals.length,
        latest: latest ? { goal: latest.g, version: latest.v.replace(".mp4", "") } : null,
        updated: statSync(dir).mtimeMs,
      };
    });
}

export function projectDetail(project: string) {
  const dir = projectDir(project);
  const m = manifest(dir);
  const inv = readJson(path.join(dir, "work/inventory.json"));
  const revision: string = inv?.revision ?? "";
  const known = new Set(Object.values(inv?.clips ?? {}).map((c: any) => c.source));
  const rushes = walk(path.join(dir, "rushes"))
    .filter((f) => !f.endsWith(".DS_Store"))
    .map((f) => {
      const s = statSync(path.join(dir, "rushes", f));
      return { path: f, size: s.size, video: VIDEO.test(f), ingested: known.has(`rushes/${f}`) };
    });
  const clips = Object.entries(inv?.clips ?? {}).map(([id, c]: [string, any]) => {
    const fmt = c.metadata?.format ?? {};
    const video = (c.metadata?.streams ?? []).find((s: any) => s.codec_type === "video");
    return {
      id,
      source: c.source,
      duration: Number(fmt.duration ?? 0),
      width: video?.width ?? null,
      height: video?.height ?? null,
      graphics: String(c.source).startsWith("rushes/graphics/"),
      ...clipState(path.join(dir, "work"), id),
    };
  });
  const goals = dirs(path.join(dir, "goals"))
    .filter((g) => existsSync(path.join(dir, "goals", g, "project.toml")))
    .map((g) => goalSummary(dir, g, revision));
  return {
    slug: project,
    name: m.name,
    format: m.format,
    path: dir,
    rushesPath: path.join(dir, "rushes"),
    revision,
    stage: stage(dir, m.format, revision),
    rushes,
    clips,
    errors: inv?.errors ?? {},
    goals,
  };
}

/* ---------- context.md ---------- */

export async function readContext(project: string, goal?: string) {
  const file = path.join(projectDir(project, goal), "context.md");
  const text = existsSync(file) ? await readFile(file, "utf8") : "";
  const mtime = existsSync(file) ? (await stat(file)).mtimeMs : 0;
  return { text, mtime };
}

export async function writeContext(project: string, goal: string | undefined, text: unknown, mtime: unknown) {
  if (typeof text !== "string") throw new HttpError(400, "text required");
  const file = path.join(projectDir(project, goal), "context.md");
  const current = existsSync(file) ? (await stat(file)).mtimeMs : 0;
  if (typeof mtime === "number" && Math.abs(current - mtime) > 1) {
    throw new HttpError(409, "Le fichier a été modifié ailleurs (agent ou éditeur). Recharge avant d'enregistrer.");
  }
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, text);
  await rename(tmp, file);
  return { mtime: (await stat(file)).mtimeMs };
}

/* ---------- exports & notes ---------- */

function parseFps(value: unknown): number {
  if (typeof value === "number") return value;
  const [n, d] = String(value ?? "30000/1001").split("/").map(Number);
  return d ? n / d : n || 29.97;
}

export function goalExports(project: string, goal: string) {
  const dir = projectDir(project, goal);
  const m = manifest(dir);
  const presetFile = path.join(ROOT, "presets", `${m.format}.toml`);
  const preset = existsSync(presetFile) ? (parseToml(readFileSync(presetFile, "utf8")) as any) : {};
  return exportsOf(dir).map((file) => {
    const version = file.replace(".mp4", "");
    const snap = readJson(path.join(dir, "review", `${version}.json`));
    const s = statSync(path.join(dir, "exports", file));
    const notes = readJson(path.join(dir, "review", `${version}-notes.json`));
    return {
      version,
      url: `/media/${path.relative(PROJECTS, path.join(dir, "exports", file)).split(path.sep).map(encodeURIComponent).join("/")}`,
      fps: parseFps(snap?.preset?.fps ?? preset.fps),
      width: snap?.preset?.width ?? preset.width ?? null,
      height: snap?.preset?.height ?? preset.height ?? null,
      size: s.size,
      created: s.mtimeMs,
      notes: Array.isArray(notes?.notes) ? notes.notes.length : 0,
    };
  });
}

function notesFile(project: string, goal: string, version: string) {
  if (!VERSION.test(version)) throw new HttpError(400, "Invalid version");
  return path.join(projectDir(project, goal), "review", `${version}-notes.json`);
}

export async function readNotes(project: string, goal: string, version: string) {
  const data = readJson(notesFile(project, goal, version));
  return { notes: Array.isArray(data?.notes) ? data.notes : [] };
}

export async function writeNotes(project: string, goal: string, version: string, notes: unknown) {
  if (!Array.isArray(notes)) throw new HttpError(400, "notes must be an array");
  const clean = notes.map((n: any) => ({
    id: String(n.id),
    start: Number(n.start) || 0,
    end: n.end === null || n.end === undefined ? null : Number(n.end),
    text: String(n.text ?? ""),
    created: Number(n.created) || Date.now(),
  }));
  const file = notesFile(project, goal, version);
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, JSON.stringify({ version, notes: clean }, null, 2) + "\n");
  await rename(tmp, file);
  return { ok: true };
}

/* ---------- notes → sources ---------- */

/** Resolve export timecodes to shots, source times and words with `bin/vediting locate`. */
export async function locateSpans(project: string, goal: string, version: string, spans: unknown) {
  if (!VERSION.test(version)) throw new HttpError(400, "Invalid version");
  projectDir(project, goal);
  if (!Array.isArray(spans) || spans.length > 200) throw new HttpError(400, "spans must be an array");
  const args = spans.map((s: any) => {
    const start = Number(s?.[0]);
    const end = s?.[1] === null || s?.[1] === undefined ? null : Number(s[1]);
    if (!Number.isFinite(start) || start < 0 || (end !== null && !Number.isFinite(end))) throw new HttpError(400, "Invalid span");
    return end !== null && end > start ? `${start}-${end}` : `${start}`;
  });
  if (!args.length) return [];
  const { code, out } = await runCli(["locate", project, version, ...args, "--goal", goal, "--json"]);
  if (code !== 0) throw new HttpError(422, out.trim().split("\n").at(-1) || "locate failed");
  return JSON.parse(out);
}
