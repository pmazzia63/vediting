import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, onEvent, type ProjectSummary } from "../api";
import { useStudio } from "../studio";

const STAGE: Record<string, string> = {
  "copy rushes / ingest": "Rushs à déposer",
  ingested: "Rushs reconnus",
  estimate: "À estimer",
  edit: "En montage",
};

export function Projects() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const { notify } = useStudio();
  const navigate = useNavigate();

  const load = () => api.projects().then(setProjects).catch((e) => notify(e.message, "error"));
  useEffect(() => {
    load();
    return onEvent((m) => m.type === "fs" && load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { slug } = await api.createProject(name.trim());
      navigate(`/p/${slug}`);
    } catch (err) {
      notify((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Projets</h1>
        <button className="primary" onClick={() => setCreating(true)}>
          + Nouveau projet
        </button>
      </div>

      {projects === null ? (
        <p className="muted">Chargement…</p>
      ) : projects.length === 0 ? (
        <div className="empty">
          <p>Aucun projet pour l'instant.</p>
          <button className="primary" onClick={() => setCreating(true)}>
            Créer le premier projet
          </button>
        </div>
      ) : (
        <div className="grid">
          {[...projects]
            .sort((a, b) => b.updated - a.updated)
            .map((p) => (
              <Link key={p.slug} to={`/p/${p.slug}`} className="card project-card">
                <div className="card-title">{p.name}</div>
                <div className="muted small mono">{p.slug}</div>
                <div className="chips">
                  <span className="chip">{STAGE[p.stage] ?? p.stage}</span>
                  <span className="chip">{p.clips ?? p.rushes} clip{(p.clips ?? p.rushes) > 1 ? "s" : ""}</span>
                  <span className="chip">
                    {p.goals} vidéo{p.goals > 1 ? "s" : ""}
                  </span>
                </div>
                {p.latest && (
                  <div className="small muted">
                    Dernier export : {p.latest.goal} · {p.latest.version}
                  </div>
                )}
              </Link>
            ))}
        </div>
      )}

      {creating && (
        <div className="modal-backdrop" onClick={() => !busy && setCreating(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={create}>
            <h2>Nouveau projet</h2>
            <p className="muted small">
              Un projet regroupe les rushs d'un tournage. Tu pourras ensuite y créer une ou plusieurs vidéos (reel, YouTube).
            </p>
            <input autoFocus placeholder="ex. Japan by train" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="row end">
              <button type="button" className="ghost" onClick={() => setCreating(false)} disabled={busy}>
                Annuler
              </button>
              <button className="primary" disabled={!name.trim() || busy}>
                {busy ? "Création…" : "Créer"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
