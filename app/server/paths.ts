import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const PROJECTS = path.join(ROOT, "projects");
export const CLI = path.join(ROOT, "bin/vediting");
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const VERSION = /^v[0-9]{4,}$/;

export function python(): string {
  const venv = path.join(ROOT, ".venv/bin/python");
  return process.env.VEDITING_PYTHON || (existsSync(venv) ? venv : "python3");
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function slug(value: unknown, what = "slug"): string {
  if (typeof value !== "string" || !SLUG.test(value)) throw new HttpError(400, `Invalid ${what}`);
  return value;
}

/** Project (or goal) directory, guaranteed to sit under projects/. */
export function projectDir(project: unknown, goal?: unknown): string {
  const p = path.join(PROJECTS, slug(project, "project"));
  const dir = goal === undefined || goal === null || goal === "" ? p : path.join(p, "goals", slug(goal, "goal"));
  if (!existsSync(path.join(dir, "project.toml"))) throw new HttpError(404, "Unknown project or goal");
  return dir;
}
