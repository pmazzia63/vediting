import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import { addClient, watchProjects } from "./events.ts";
import { cancelJob, killAll, listJobs, startJob } from "./jobs.ts";
import { HttpError, PROJECTS, ROOT, projectDir, slug } from "./paths.ts";
import { goalExports, listProjects, projectDetail, readContext, readNotes, writeContext, writeNotes } from "./projects.ts";
import { runCli } from "./run.ts";
import { attach, killSessions, sendInput, sessionInfo, startSession } from "./terminal.ts";

const PORT = Number(process.env.PORT || 5178);
const DEV_PORT = 5179;
const HOST = "127.0.0.1";
const allowedHosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`, `127.0.0.1:${DEV_PORT}`, `localhost:${DEV_PORT}`]);
const allowedOrigins = new Set([...allowedHosts].map((h) => `http://${h}`));

const app = Fastify({ logger: { level: "warn" } });

/*
 * The server drives a shell, so refuse anything that does not come from the app itself:
 * the Host check blocks DNS rebinding and the Origin check blocks other sites' requests
 * and WebSockets (which browsers do not restrict by CORS).
 */
app.addHook("onRequest", async (req, reply) => {
  const host = req.headers.host ?? "";
  const origin = req.headers.origin;
  if (!allowedHosts.has(host)) return reply.code(403).send({ error: "Forbidden host" });
  const mutating = req.method !== "GET" && req.method !== "HEAD";
  const isWs = req.headers.upgrade?.toLowerCase() === "websocket";
  if ((mutating || isWs) && origin !== undefined && !allowedOrigins.has(origin)) {
    return reply.code(403).send({ error: "Forbidden origin" });
  }
  if (isWs && origin === undefined) return reply.code(403).send({ error: "Origin required" });
});

app.setErrorHandler((err: any, _req, reply) => {
  const status = err instanceof HttpError ? err.status : err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
  if (status >= 500) app.log.error(err);
  reply.code(status).send({ error: err.message || "Erreur serveur" });
});

await app.register(fastifyWebsocket);
await app.register(fastifyStatic, { root: PROJECTS, prefix: "/media/", decorateReply: false, dotfiles: "deny", index: false });

type P = { project: string; goal: string; version: string; id: string };
type Req = FastifyRequest<{ Params: P }>;
const body = (req: FastifyRequest) => (req.body ?? {}) as Record<string, any>;

/* ---------- projects ---------- */

app.get("/api/projects", async () => listProjects());

app.post("/api/projects", async (req: Req, reply: FastifyReply) => {
  const name = String(body(req).name ?? "").trim();
  if (!name || name.length > 120) throw new HttpError(400, "Nom requis");
  const { code, out } = await runCli(["new", name]);
  if (code !== 0) throw new HttpError(400, out.trim().split("\n").at(-1) || "Création impossible");
  const rushes = out.trim().split("\n")[0];
  reply.code(201);
  return { slug: path.basename(path.dirname(rushes)) };
});

app.get("/api/projects/:project", async (req: Req) => projectDetail(slug(req.params.project)));

app.post("/api/projects/:project/reveal", async (req: Req) => {
  const dir = projectDir(req.params.project);
  const sub = body(req).goal ? path.join(projectDir(req.params.project, body(req).goal), "exports") : path.join(dir, "rushes");
  spawn("open", [sub], { stdio: "ignore", detached: true }).unref();
  return { ok: true };
});

/* ---------- jobs ---------- */

app.get("/api/projects/:project/jobs", async (req: Req) => listJobs(slug(req.params.project)));
app.post("/api/projects/:project/jobs", async (req: Req) =>
  startJob(req.params.project, body(req).cmd, { skipGraphics: !!body(req).skipGraphics, ids: body(req).ids }),
);
app.post("/api/jobs/:id/cancel", async (req: Req) => cancelJob(req.params.id));

/* ---------- goals ---------- */

app.post("/api/projects/:project/goals", async (req: Req, reply: FastifyReply) => {
  projectDir(req.params.project);
  const g = slug(body(req).slug, "nom de vidéo (minuscules, chiffres et tirets)");
  const format = body(req).format;
  if (format !== "reel" && format !== "youtube") throw new HttpError(400, "Format reel ou youtube");
  const { code, out } = await runCli(["goal", req.params.project, g, "--format", format]);
  if (code !== 0) throw new HttpError(400, out.trim().split("\n").at(-1) || "Création impossible");
  reply.code(201);
  return { slug: g };
});

app.get("/api/projects/:project/context", async (req: Req) => readContext(req.params.project));
app.put("/api/projects/:project/context", async (req: Req) => writeContext(req.params.project, undefined, body(req).text, body(req).mtime));
app.get("/api/projects/:project/goals/:goal/context", async (req: Req) => readContext(req.params.project, req.params.goal));
app.put("/api/projects/:project/goals/:goal/context", async (req: Req) =>
  writeContext(req.params.project, req.params.goal, body(req).text, body(req).mtime),
);

app.get("/api/projects/:project/goals/:goal/exports", async (req: Req) => goalExports(req.params.project, req.params.goal));
app.get("/api/projects/:project/goals/:goal/notes/:version", async (req: Req) =>
  readNotes(req.params.project, req.params.goal, req.params.version),
);
app.put("/api/projects/:project/goals/:goal/notes/:version", async (req: Req) =>
  writeNotes(req.params.project, req.params.goal, req.params.version, body(req).notes),
);

/* ---------- terminal ---------- */

app.get("/api/terminal/:id", async (req: Req) => sessionInfo(req.params.id) ?? { id: req.params.id, agent: null, alive: false });
app.post("/api/terminal/:id/start", async (req: Req) => startSession(req.params.id, body(req).agent));
app.post("/api/terminal/:id/input", async (req: Req) => sendInput(req.params.id, body(req).text, body(req).submit !== false));

/* ---------- websockets ---------- */

app.register(async (scope) => {
  scope.get("/ws/events", { websocket: true }, (socket) => addClient(socket as any));
  scope.get("/ws/terminal/:id", { websocket: true }, (socket, req: any) => attach(req.params.id, socket));
});

/* ---------- built front-end ---------- */

const dist = path.join(ROOT, "app/dist");
if (existsSync(dist)) {
  await app.register(fastifyStatic, { root: dist, prefix: "/" });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api") || req.url.startsWith("/media") || req.url.startsWith("/ws")) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.sendFile("index.html", dist);
  });
}

const watcher = watchProjects();
const shutdown = async () => {
  killAll();
  killSessions();
  await watcher.close();
  await app.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: PORT, host: HOST });
console.log(`vediting Studio · http://${HOST}:${PORT}${existsSync(dist) ? "" : `  (front dev : http://${HOST}:${DEV_PORT})`}`);
