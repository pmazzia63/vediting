import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, bytes, onEvent, timecode, type ExportInfo, type Note } from "../api";
import { useStudio } from "../studio";
import { revisionPrompt } from "../prompts";

const SPEEDS = [0.25, 0.5, 1, 1.5, 2];

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable || !!t.closest(".terminal-panel"));
}

export function Viewer() {
  const { project = "", goal = "" } = useParams();
  const { notify, send, copy, promptAgent } = useStudio();
  const [exports, setExports] = useState<ExportInfo[] | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const known = useRef<Set<string>>(new Set());

  const loadExports = useCallback(
    (initial = false) =>
      api
        .exports(project, goal)
        .then((list) => {
          setExports(list);
          const fresh = list.filter((e) => !known.current.has(e.version));
          list.forEach((e) => known.current.add(e.version));
          if (initial) setVersion((v) => v ?? list.at(-1)?.version ?? null);
          else if (fresh.length) {
            const v = fresh.at(-1)!.version;
            setVersion(v);
            notify(`Nouvel export détecté : ${v}`);
          }
        })
        .catch((e) => notify(e.message, "error")),
    [project, goal, notify],
  );

  useEffect(() => {
    known.current = new Set();
    setVersion(null);
    loadExports(true);
    return onEvent((m) => {
      if (m.type === "fs" && m.project === project && m.goal === goal && (m.area === "exports" || m.area === "review")) loadExports();
    });
  }, [project, goal, loadExports]);

  const current = exports?.find((e) => e.version === version) ?? null;

  /* ---------- player state ---------- */
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [markIn, setMarkIn] = useState<number | null>(null);
  const [markOut, setMarkOut] = useState<number | null>(null);
  const fps = current?.fps ?? 29.97;

  // Precise time display: follow every presented frame when supported.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    let handle = 0;
    let raf = 0;
    const anyV = v as any;
    if (typeof anyV.requestVideoFrameCallback === "function") {
      const tick = (_now: number, meta: any) => {
        setTime(meta.mediaTime ?? v.currentTime);
        handle = anyV.requestVideoFrameCallback(tick);
      };
      handle = anyV.requestVideoFrameCallback(tick);
    }
    const loop = () => {
      if (v.paused) setTime(v.currentTime);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      if (handle && anyV.cancelVideoFrameCallback) anyV.cancelVideoFrameCallback(handle);
    };
  }, [current?.url]);

  useEffect(() => {
    setMarkIn(null);
    setMarkOut(null);
    setTime(0);
  }, [version]);

  const seek = (t: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(t, 0), v.duration || t);
    setTime(v.currentTime);
  };
  const frame = Math.floor(time * fps + 1e-6);
  const stepFrames = (n: number) => {
    video.current?.pause();
    // Aim at the middle of the target frame to avoid landing on a boundary.
    seek((Math.max(frame + n, 0) + 0.5) / fps);
  };
  const toggle = () => {
    const v = video.current;
    if (!v) return;
    v.paused ? v.play() : v.pause();
  };
  const setRate = (r: number) => {
    setSpeed(r);
    if (video.current) video.current.playbackRate = r;
  };

  /* ---------- notes ---------- */
  const [notes, setNotes] = useState<Note[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);
  const saveTimer = useRef<number>();

  useEffect(() => {
    loadedFor.current = null;
    setNotes([]);
    if (!version) return;
    api
      .notes(project, goal, version)
      .then((r) => {
        setNotes(r.notes);
        loadedFor.current = version;
      })
      .catch((e) => notify(e.message, "error"));
  }, [project, goal, version, notify]);

  const persist = (next: Note[]) => {
    setNotes(next);
    if (!version || loadedFor.current !== version) return;
    clearTimeout(saveTimer.current);
    const v = version;
    saveTimer.current = window.setTimeout(() => api.saveNotes(project, goal, v, next).catch((e) => notify(e.message, "error")), 400);
  };

  const addNote = () => {
    let start = time;
    let end: number | null = null;
    if (markIn !== null && markOut !== null && markOut > markIn) {
      start = markIn;
      end = markOut;
    } else if (markIn !== null && markIn < time) {
      start = markIn;
      end = time;
    }
    const n: Note = { id: crypto.randomUUID(), start: Math.round(start * 1000) / 1000, end: end === null ? null : Math.round(end * 1000) / 1000, text: "", created: Date.now() };
    persist([...notes, n]);
    setFocusId(n.id);
    setMarkIn(null);
    setMarkOut(null);
    video.current?.pause();
  };

  const sorted = useMemo(() => [...notes].sort((a, b) => a.start - b.start), [notes]);
  const prompt = version ? revisionPrompt(promptAgent, project, goal, version, notes) : "";
  const hasText = notes.some((n) => n.text.trim());

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const v = video.current;
      if (!v) return;
      switch (e.key) {
        case " ":
        case "k":
        case "K":
          e.preventDefault();
          e.key === " " ? toggle() : v.pause();
          break;
        case "ArrowLeft":
        case ",":
          e.preventDefault();
          e.shiftKey ? seek(v.currentTime - 1) : stepFrames(-1);
          break;
        case "ArrowRight":
        case ".":
          e.preventDefault();
          e.shiftKey ? seek(v.currentTime + 1) : stepFrames(1);
          break;
        case "j":
        case "J":
          seek(v.currentTime - (e.shiftKey ? 5 : 2));
          break;
        case "l":
        case "L": {
          const i = SPEEDS.indexOf(speed);
          if (v.paused) {
            setRate(1);
            v.play();
          } else setRate(SPEEDS[Math.min(i + 1, SPEEDS.length - 1)]);
          break;
        }
        case "i":
        case "I":
          setMarkIn(v.currentTime);
          if (markOut !== null && markOut <= v.currentTime) setMarkOut(null);
          break;
        case "o":
        case "O":
          setMarkOut(v.currentTime);
          break;
        case "n":
        case "N":
          e.preventDefault();
          addNote();
          break;
        case "Escape":
          setMarkIn(null);
          setMarkOut(null);
          break;
        case "Home":
          seek(0);
          break;
        case "End":
          seek(v.duration);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------- timeline scrubbing ---------- */
  const bar = useRef<HTMLDivElement>(null);
  const scrub = (e: React.PointerEvent) => {
    const el = bar.current;
    if (!el || !dur) return;
    const at = (x: number) => {
      const r = el.getBoundingClientRect();
      seek(((x - r.left) / r.width) * dur);
    };
    at(e.clientX);
    const move = (ev: PointerEvent) => at(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const pct = (t: number) => `${dur ? (t / dur) * 100 : 0}%`;

  if (exports === null) return <div className="page muted">Chargement…</div>;

  return (
    <div className="viewer">
      <aside className="versions">
        <Link to={`/p/${project}`} className="muted small">
          ← {project}
        </Link>
        <h2 className="goal-name">{goal}</h2>
        <div className="muted small">Versions</div>
        {exports.length === 0 && (
          <p className="muted small">
            Aucun export pour l'instant. Lance la génération depuis la page du projet ; la vidéo apparaîtra ici automatiquement.
          </p>
        )}
        {[...exports].reverse().map((e) => (
          <button key={e.version} className={`version ${e.version === version ? "on" : ""}`} onClick={() => setVersion(e.version)}>
            <span className="mono">{e.version}</span>
            <span className="muted small">
              {new Date(e.created).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} · {bytes(e.size)}
            </span>
            {e.notes > 0 && <span className="chip">{e.notes} note{e.notes > 1 ? "s" : ""}</span>}
          </button>
        ))}
        <button className="small ghost" onClick={() => api.reveal(project, goal).catch((e) => notify(e.message, "error"))}>
          Ouvrir le dossier exports
        </button>
      </aside>

      <section className="player">
        {current ? (
          <>
            <div className="video-wrap">
              <video
                key={current.url}
                ref={video}
                src={current.url}
                preload="auto"
                onLoadedMetadata={(e) => {
                  setDur(e.currentTarget.duration);
                  e.currentTarget.playbackRate = speed;
                }}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onClick={toggle}
              />
            </div>
            <div className="timecode-row">
              <span className="timecode mono">{timecode(time)}</span>
              <span className="muted mono small">
                img {frame} · {fps.toFixed(3).replace(/\.?0+$/, "")} i/s
              </span>
              <div className="spacer" />
              <span className="muted mono small">{timecode(dur)}</span>
            </div>
            <div className="timeline" ref={bar} onPointerDown={scrub}>
              {markIn !== null && (
                <div className="mark-range" style={{ left: pct(markIn), width: pct(Math.max((markOut ?? time) - markIn, 0)) }} />
              )}
              {sorted.map((n) =>
                n.end !== null ? (
                  <div key={n.id} className="note-range" style={{ left: pct(n.start), width: pct(n.end - n.start) }} title={n.text} />
                ) : (
                  <div key={n.id} className="note-pin" style={{ left: pct(n.start) }} title={n.text} />
                ),
              )}
              <div className="played" style={{ width: pct(time) }} />
              <div className="playhead" style={{ left: pct(time) }} />
            </div>
            <div className="controls">
              <button onClick={() => stepFrames(-1)} title="Image précédente (← ou ,)">
                ⏮︎ 1 img
              </button>
              <button className="primary play" onClick={toggle} title="Lecture / pause (Espace)">
                {playing ? "❚❚" : "▶"}
              </button>
              <button onClick={() => stepFrames(1)} title="Image suivante (→ ou .)">
                1 img ⏭︎
              </button>
              <div className="segmented">
                {SPEEDS.map((s) => (
                  <button key={s} className={speed === s ? "on" : ""} onClick={() => setRate(s)}>
                    {s}×
                  </button>
                ))}
              </div>
              <div className="spacer" />
              <button onClick={() => setMarkIn(time)} title="Point d'entrée (I)">
                I {markIn !== null ? timecode(markIn) : ""}
              </button>
              <button onClick={() => setMarkOut(time)} title="Point de sortie (O)">
                O {markOut !== null ? timecode(markOut) : ""}
              </button>
              {(markIn !== null || markOut !== null) && (
                <button className="ghost" onClick={() => (setMarkIn(null), setMarkOut(null))} title="Effacer (Échap)">
                  ✕
                </button>
              )}
            </div>
            <div className="muted small shortcuts">
              Espace lecture · ←/→ image par image (⇧ = 1 s) · J recul · L lecture/accélère · K pause · I/O plage · N note
            </div>
          </>
        ) : (
          <div className="empty">Aucune vidéo à afficher.</div>
        )}
      </section>

      <aside className="notes">
        <div className="row">
          <h2>Notes</h2>
          <div className="spacer" />
          <button className="primary" disabled={!current} onClick={addNote} title="N">
            + Note {markIn !== null ? "(plage)" : `à ${timecode(time)}`}
          </button>
        </div>
        <div className="muted small">Pose I puis O (ou seulement I) pour une note sur une plage.</div>
        <div className="note-list">
          {sorted.length === 0 && <p className="muted small">Aucune note sur cette version.</p>}
          {sorted.map((n) => (
            <div key={n.id} className={`note ${time >= n.start && time <= (n.end ?? n.start + 0.5) ? "current" : ""}`}>
              <div className="row">
                <button className="link mono small" onClick={() => seek(n.start)}>
                  {timecode(n.start)}
                  {n.end !== null && ` → ${timecode(n.end)}`}
                </button>
                <div className="spacer" />
                <button
                  className="link small"
                  title="Recaler le début sur la position actuelle"
                  onClick={() => persist(notes.map((x) => (x.id === n.id ? { ...x, start: time, end: x.end !== null && x.end <= time ? null : x.end } : x)))}
                >
                  ⇤
                </button>
                <button
                  className="link small"
                  title="Recaler la fin sur la position actuelle"
                  onClick={() => persist(notes.map((x) => (x.id === n.id && time > x.start ? { ...x, end: time } : x)))}
                >
                  ⇥
                </button>
                <button className="link small danger" title="Supprimer" onClick={() => persist(notes.filter((x) => x.id !== n.id))}>
                  ✕
                </button>
              </div>
              <textarea
                value={n.text}
                rows={2}
                placeholder="Commentaire…"
                autoFocus={focusId === n.id}
                onChange={(e) => persist(notes.map((x) => (x.id === n.id ? { ...x, text: e.target.value } : x)))}
                onKeyDown={(e) => {
                  if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
                }}
              />
            </div>
          ))}
        </div>
        <div className="notes-footer">
          <details>
            <summary className="small muted">Aperçu du prompt</summary>
            <pre className="prompt">{prompt}</pre>
          </details>
          <div className="row">
            <button className="primary" disabled={!hasText} onClick={() => copy(prompt)}>
              Copier le prompt
            </button>
            <button disabled={!hasText} onClick={() => send(prompt)}>
              Envoyer au terminal
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
