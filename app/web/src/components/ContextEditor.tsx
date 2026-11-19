import { useEffect, useState } from "react";
import { api, onEvent } from "../api";
import { useStudio } from "../studio";

/** Edits a context.md in place. Refuses to overwrite a file changed elsewhere (e.g. by the agent). */
export function ContextEditor({ project, goal, rows = 16 }: { project: string; goal?: string; rows?: number }) {
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const [mtime, setMtime] = useState(0);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const { notify } = useStudio();
  const dirty = text !== null && text !== saved;

  const load = () =>
    api.context(project, goal).then((c) => {
      setText(c.text);
      setSaved(c.text);
      setMtime(c.mtime);
      setStale(false);
    });

  useEffect(() => {
    load().catch((e) => notify(e.message, "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, goal]);

  useEffect(
    () =>
      onEvent((m) => {
        if (m.type !== "fs" || m.project !== project || (m.goal ?? undefined) !== goal || m.area !== "context.md") return;
        api.context(project, goal).then((c) => {
          if (c.mtime === mtime) return;
          if (!dirty) {
            setText(c.text);
            setSaved(c.text);
            setMtime(c.mtime);
          } else setStale(true);
        });
      }),
    [project, goal, mtime, dirty],
  );

  const save = async () => {
    if (text === null) return;
    setBusy(true);
    try {
      const r = await api.saveContext(project, goal, text, mtime);
      setSaved(text);
      setMtime(r.mtime);
      notify("Contexte enregistré");
    } catch (e) {
      notify((e as Error).message, "error");
      setStale(true);
    } finally {
      setBusy(false);
    }
  };

  if (text === null) return <p className="muted small">Chargement du contexte…</p>;
  return (
    <div className="context-editor">
      {stale && (
        <div className="warn small">
          Le fichier a changé sur le disque (agent ou éditeur).{" "}
          <button className="link" onClick={() => load()}>
            Recharger (perd tes modifications)
          </button>
        </div>
      )}
      <textarea
        value={text}
        rows={rows}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "s") {
            e.preventDefault();
            save();
          }
        }}
      />
      <div className="row">
        <span className="muted small mono">{goal ? `goals/${goal}/context.md` : "context.md"}</span>
        <div className="spacer" />
        <button className="small" disabled={!dirty || busy} onClick={() => setText(saved)}>
          Annuler
        </button>
        <button className="small primary" disabled={!dirty || busy} onClick={save}>
          {busy ? "…" : "Enregistrer ⌘S"}
        </button>
      </div>
    </div>
  );
}
