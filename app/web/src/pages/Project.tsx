import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { api, bytes, duration, onEvent, type Goal, type Job, type ProjectDetail } from "../api";
import { useStudio } from "../studio";
import { JobProgress } from "../components/JobProgress";
import { ContextEditor } from "../components/ContextEditor";
import { analyzePrompt, editPrompt, estimatePrompt } from "../prompts";

type State = "done" | "active" | "todo" | "warn";

function Step({ n, title, state, summary, children }: { n: number; title: string; state: State; summary?: ReactNode; children: ReactNode }) {
  return (
    <section className={`step ${state}`}>
      <div className="step-marker">{state === "done" ? "✓" : n}</div>
      <div className="step-body">
        <div className="step-head">
          <h2>{title}</h2>
          {summary && <span className="muted small">{summary}</span>}
        </div>
        {children}
      </div>
    </section>
  );
}

function PromptActions({ text, label }: { text: string; label: string }) {
  const { send, copy } = useStudio();
  return (
    <div className="prompt-actions">
      <pre className="prompt">{text}</pre>
      <div className="row">
        <button className="primary" onClick={() => send(text)}>
          {label} ▸ terminal
        </button>
        <button onClick={() => copy(text)}>Copier le prompt</button>
      </div>
    </div>
  );
}

function GoalCard({ project, goal }: { project: string; goal: Goal }) {
  const { promptAgent } = useStudio();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"context" | "estimate" | "edit">("context");
  return (
    <div className="goal-card">
      <div className="row">
        <button className="link goal-title" onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} {goal.slug}
        </button>
        <span className="chip">{goal.format === "reel" ? "Reel 9:16" : "YouTube 16:9"}</span>
        <span className="chip">{goal.exports.length} version{goal.exports.length > 1 ? "s" : ""}</span>
        <div className="spacer" />
        {goal.latest && (
          <Link className="button small primary" to={`/p/${project}/${goal.slug}`}>
            Visionner {goal.latest.replace(".mp4", "")}
          </Link>
        )}
      </div>
      {open && (
        <div className="goal-body">
          <div className="tabs">
            <button className={tab === "context" ? "on" : ""} onClick={() => setTab("context")}>
              1 · Contexte
            </button>
            <button className={tab === "estimate" ? "on" : ""} onClick={() => setTab("estimate")}>
              2 · Estimer (optionnel)
            </button>
            <button className={tab === "edit" ? "on" : ""} onClick={() => setTab("edit")}>
              3 · Générer
            </button>
          </div>
          {tab === "context" && (
            <>
              <p className="muted small">
                Décris ce que la vidéo doit raconter : personnes, lieux, ordre, moments à garder, exclusions, musique, durée visée.
              </p>
              <ContextEditor project={project} goal={goal.slug} />
            </>
          )}
          {tab === "estimate" && <PromptActions text={estimatePrompt(promptAgent, project, goal.slug)} label="Estimer" />}
          {tab === "edit" && (
            <>
              <p className="muted small">
                L'agent monte la vidéo et livre <span className="mono">exports/vNNNN.mp4</span>. La visionneuse la détecte automatiquement.
              </p>
              <PromptActions text={editPrompt(promptAgent, project, goal.slug)} label="Générer la vidéo" />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NewGoal({ project, onCreated }: { project: string; onCreated: () => void }) {
  const [slug, setSlug] = useState("");
  const [format, setFormat] = useState("reel");
  const [busy, setBusy] = useState(false);
  const { notify } = useStudio();
  const clean = slug
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return (
    <form
      className="row new-goal"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api.createGoal(project, clean, format);
          setSlug("");
          onCreated();
        } catch (err) {
          notify((err as Error).message, "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <input placeholder="Nom de la vidéo (ex. triathlon-reel)" value={slug} onChange={(e) => setSlug(e.target.value)} />
      <select value={format} onChange={(e) => setFormat(e.target.value)}>
        <option value="reel">Reel 9:16</option>
        <option value="youtube">YouTube 16:9</option>
      </select>
      <button className="primary" disabled={!clean || busy}>
        + Nouvelle vidéo
      </button>
      {slug && clean !== slug && <span className="muted small mono">→ {clean}</span>}
    </form>
  );
}

export function Project() {
  const { project = "" } = useParams();
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [skipGraphics, setSkipGraphics] = useState(true);
  const [showClips, setShowClips] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const { notify, promptAgent } = useStudio();

  const load = () => api.project(project).then(setData).catch((e) => notify(e.message, "error"));
  useEffect(() => {
    load();
    api.jobs(project).then(setJobs).catch(() => {});
    return onEvent((m) => {
      if (m.type === "fs" && m.project === project) load();
      if (m.type === "job" && m.job.project === project)
        setJobs((js) => [m.job, ...js.filter((j) => j.id !== m.job.id)].sort((a, b) => b.started - a.started));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  if (!data) return <div className="page muted">Chargement…</div>;

  const running = jobs.find((j) => j.status === "running");
  const lastOf = (cmd: string) => jobs.find((j) => j.cmd === cmd);
  const run = (cmd: string) => api.startJob(project, cmd, { skipGraphics }).catch((e) => notify(e.message, "error"));

  const videos = data.rushes.filter((r) => r.video);
  const mp4 = videos.filter((r) => /\.mp4$/i.test(r.path));
  const unsupported = videos.filter((r) => !/\.mp4$/i.test(r.path));
  const notIngested = mp4.filter((r) => !r.ingested);
  const errors = Object.entries(data.errors);
  const clips = data.clips;
  const prepared = clips.filter((c) => c.prepared && (c.graphics && skipGraphics ? true : c.transcript)).length;
  const catalogued = clips.filter((c) => c.moments === "done").length;
  const totalDuration = clips.reduce((a, c) => a + c.duration, 0);

  const s1: State = videos.length ? "done" : "active";
  const s2: State = !videos.length ? "todo" : data.revision && !notIngested.length ? (errors.length ? "warn" : "done") : "active";
  const s3: State = !clips.length ? "todo" : prepared === clips.length ? "done" : "active";
  const s4: State = !clips.length ? "todo" : catalogued === clips.length ? "done" : s3 === "done" ? "active" : "todo";
  const s5: State = data.goals.some((g) => g.exports.length) ? "done" : s4 === "done" || clips.length ? "active" : "todo";

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link to="/" className="muted small">
            ← Projets
          </Link>
          <h1>{data.name}</h1>
          <span className="muted small mono">projects/{data.slug}</span>
        </div>
      </div>

      <div className="pipeline">
        <Step n={1} title="Rushs" state={s1} summary={`${videos.length} fichier${videos.length > 1 ? "s" : ""} vidéo`}>
          <p className="muted small">Dépose tes fichiers vidéo (MP4) dans le dossier rushes du projet, puis reviens ici.</p>
          <div className="row">
            <button className="primary" onClick={() => api.reveal(project).catch((e) => notify(e.message, "error"))}>
              Ouvrir le dossier dans le Finder
            </button>
            <span className="muted small mono">{data.rushesPath}</span>
          </div>
          {videos.length > 0 && (
            <ul className="file-list">
              {videos.slice(0, 200).map((r) => (
                <li key={r.path}>
                  <span className="mono">{r.path}</span>
                  <span className="muted small">{bytes(r.size)}</span>
                  {!/\.mp4$/i.test(r.path) ? (
                    <span className="chip warn">non pris en charge</span>
                  ) : r.ingested ? (
                    <span className="chip ok">reconnu</span>
                  ) : (
                    <span className="chip">nouveau</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {unsupported.length > 0 && (
            <p className="warn small">Seuls les .mp4 sont pris en charge par le CLI : convertis les autres formats avant l'analyse.</p>
          )}
        </Step>

        <Step
          n={2}
          title="Analyse des rushs"
          state={s2}
          summary={data.revision ? `${clips.length} clips reconnus · ${duration(totalDuration)}` : "pas encore lancée"}
        >
          <p className="muted small">Reconnaît et inventorie tous les rushs (durée, flux vidéo et audio).</p>
          <div className="row">
            <button className="primary" disabled={!!running || !mp4.length} onClick={() => run("ingest")}>
              {data.revision ? "Relancer l'analyse" : "Analyser les rushs"}
            </button>
            {notIngested.length > 0 && data.revision && <span className="chip">{notIngested.length} nouveau(x) fichier(s)</span>}
          </div>
          {lastOf("ingest") && <JobProgress job={lastOf("ingest")!} onError={(m) => notify(m, "error")} />}
          {errors.length > 0 && (
            <div className="warn small">
              Fichiers rejetés :
              <ul>
                {errors.map(([p, r]) => (
                  <li key={p}>
                    <span className="mono">{p}</span> — {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Step>

        <Step n={3} title="Préparation" state={s3} summary={clips.length ? `${prepared}/${clips.length} clips prêts` : undefined}>
          <p className="muted small">Proxy 720p, planche contact et transcription horodatée pour chaque clip. Reprend là où elle s'est arrêtée.</p>
          <div className="row">
            <button className="primary" disabled={!!running || !clips.length} onClick={() => run("prepare")}>
              Lancer la préparation
            </button>
            <label className="small">
              <input type="checkbox" checked={skipGraphics} onChange={(e) => setSkipGraphics(e.target.checked)} /> Ignorer la transcription des
              graphiques
            </label>
            <div className="spacer" />
            {clips.length > 0 && (
              <button className="small ghost" onClick={() => setShowClips(!showClips)}>
                {showClips ? "Masquer les clips" : "Détail des clips"}
              </button>
            )}
          </div>
          {lastOf("prepare") && <JobProgress job={lastOf("prepare")!} onError={(m) => notify(m, "error")} />}
          {showClips && (
            <table className="clips">
              <thead>
                <tr>
                  <th>Clip</th>
                  <th>Durée</th>
                  <th>Proxy</th>
                  <th>Transcript</th>
                  <th>Moments</th>
                </tr>
              </thead>
              <tbody>
                {clips.map((c) => (
                  <tr key={c.id}>
                    <td className="mono" title={c.id}>
                      {c.source.replace(/^rushes\//, "")}
                    </td>
                    <td>{duration(c.duration)}</td>
                    <td>{c.prepared ? "✓" : "—"}</td>
                    <td>{c.graphics ? "graph." : c.transcript ? "✓" : "—"}</td>
                    <td>{c.moments === "done" ? "✓" : c.moments === "pending" ? "à faire" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Step>

        <Step n={4} title="Catalogage IA" state={s4} summary={clips.length ? `${catalogued}/${clips.length} clips catalogués` : undefined}>
          <p className="muted small">
            L'agent regarde chaque proxy et transcript et écrit les moments horodatés dans <span className="mono">moments.md</span>.
          </p>
          <PromptActions text={analyzePrompt(promptAgent, project)} label="Cataloguer" />
          <button className="small ghost" onClick={() => setShowNotes(!showNotes)}>
            {showNotes ? "▾" : "▸"} Notes de tournage du projet (personnes, lieux, dates)
          </button>
          {showNotes && <ContextEditor project={project} rows={8} />}
        </Step>

        <Step
          n={5}
          title="Vidéos"
          state={s5}
          summary={`${data.goals.length} vidéo${data.goals.length > 1 ? "s" : ""}`}
        >
          <p className="muted small">Chaque vidéo a son propre contexte, ses versions et ses retours, à partir des mêmes rushs.</p>
          {data.goals.map((g) => (
            <GoalCard key={g.slug} project={project} goal={g} />
          ))}
          <NewGoal project={project} onCreated={load} />
        </Step>
      </div>
    </div>
  );
}
