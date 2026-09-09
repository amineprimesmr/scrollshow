"use client";
import { useEffect, useRef, useState } from "react";
import { publicationTextProgress } from "@/lib/publication-text";
import type { AccountVideo } from "@/lib/types";
import type { InsightHook } from "@/lib/insights";

type TextUpdate = Pick<AccountVideo, "id" | "slideTexts">;
export function PublicationTextSearch({ accountKey, range, videos, query, onQuery, hookOnly, onScope, onUpdate, priorityPostId, en }: {
  accountKey: string; range: number | "all"; videos: AccountVideo[]; query: string; onQuery: (value: string) => void;
  hookOnly: boolean; onScope: (value: boolean) => void; onUpdate: (updates: TextUpdate[], hooks: InsightHook[]) => void; en: boolean;
  priorityPostId?: string;
}) {
  const progress = publicationTextProgress(videos);
  const [paused, setPaused] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const retryFailed = useRef(false);
  const cursor = useRef<string | undefined>(undefined);
  const update = useRef(onUpdate); update.current = onUpdate;
  const hasWork = progress.pending > 0;
  const tr = (fr: string, english: string) => en ? english : fr;
  useEffect(() => {
    if (paused || (!hasWork && !retryFailed.current)) { setRunning(false); return; }
    let active = true;
    let retry = retryFailed.current; retryFailed.current = false;
    setRunning(true); setError("");
    void (async () => {
      try {
        while (active) {
          const response = await fetch("/api/studio/insights/text", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: accountKey, days: range, retryFailed: retry, priorityPostId, after: cursor.current }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "text_failed");
          if (!active) break;
          cursor.current = result.cursor;
          update.current(result.updates, result.hooks);
          retry = false;
          if (!result.progress.pending) break;
        }
      } catch { if (active) setError(en ? "Image reading paused. Try again to continue." : "Lecture des images interrompue. Réessaie pour continuer."); }
      finally { if (active) setRunning(false); }
    })();
    return () => { active = false; };
  }, [accountKey, range, paused, hasWork, attempt, priorityPostId, en]);
  return <div className="ss-text-search">
    <div className="ss-text-search__field">
      <input className="ss-input ss-acc__search" type="search" value={query} onChange={e => onQuery(e.target.value)}
        aria-label={tr("Chercher dans le texte des slides", "Search slide text")} placeholder={tr("Chercher un hook ou du texte dans les slides…", "Search hooks or text on slides…")} />
      <div className="ss-acc__range" role="group" aria-label={tr("Où chercher", "Search scope")}>
        <button type="button" className={!hookOnly ? "is-on" : ""} aria-pressed={!hookOnly} onClick={() => onScope(false)}>{tr("Toutes les slides", "All slides")}</button>
        <button type="button" className={hookOnly ? "is-on" : ""} aria-pressed={hookOnly} onClick={() => onScope(true)}>{tr("Hook · slide 1", "Hook · slide 1")}</button>
      </div>
    </div>
    <div className="ss-text-search__status">
      <span role="status">{error || (!progress.total ? tr("Aucune image disponible à lire.", "No images available to read.") : running && !paused
        ? tr(`Lecture des images · ${progress.done}/${progress.total}`, `Reading images · ${progress.done}/${progress.total}`)
        : progress.pending ? tr(`Recherche partielle · ${progress.done}/${progress.total} images lues`, `Partial search · ${progress.done}/${progress.total} images read`)
        : tr(`Texte des images prêt · ${progress.total - progress.failed}/${progress.total}`, `Image text ready · ${progress.total - progress.failed}/${progress.total}`))}
        {!error && progress.uncertain > 0 ? tr(` · ${progress.uncertain} lectures incertaines`, ` · ${progress.uncertain} uncertain readings`) : ""}
        {!error && progress.failed > 0 ? tr(` · ${progress.failed} images indisponibles`, ` · ${progress.failed} unavailable images`) : ""}
      </span>
      {progress.pending > 0 ? <button type="button" className="ss-text-search__action" onClick={() => { if (error) { setAttempt(n => n + 1); setPaused(false); } else setPaused(v => !v); }}>
        {tr(error ? "Réessayer" : paused ? "Continuer la lecture" : "Pause", error ? "Retry" : paused ? "Continue reading" : "Pause")}</button> : null}
      {!progress.pending && progress.failed > 0 ? <button type="button" className="ss-text-search__action" onClick={() => { retryFailed.current = true; setPaused(false); setAttempt(n => n + 1); }}>{tr("Relire les images indisponibles", "Retry unavailable images")}</button> : null}
      <small>{tr("Texte visible sur les slides et couvertures. Les légendes ne sont pas recherchées.", "Visible text on slides and covers. Captions are not searched.")}</small>
    </div>
  </div>;
}
