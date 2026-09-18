"use client";
import { useEffect, useRef, useState } from "react";
import { publicationTextProgress } from "@/lib/publication-text";
import type { AccountVideo } from "@/lib/types";
import type { InsightHook } from "@/lib/insights";

type TextUpdate = Pick<AccountVideo, "id" | "slideTexts">;
/** Lectures automatiques par ouverture de compte (2 slides chacune). Au-dela, la
 * lecture se met en pause : « Reprendre », ou une recherche, la relance sans
 * plafond. Un compte de mille slides lance sinon mille OCR — du CPU serveur
 * facture — pour un utilisateur qui ne cherchera peut-etre jamais de texte. */
const AUTO_BATCHES = 30;

export function PublicationTextSearch({ accountKey, range, videos, query, onQuery, hookOnly, onScope, onUpdate, priorityPostId, en, enabled = true }: {
  /** Panneau replie : rien ne tourne. */
  enabled?: boolean;
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
  const budget = useRef(AUTO_BATCHES);
  const searching = query.trim().length > 0;
  const searchingRef = useRef(searching); searchingRef.current = searching;
  const update = useRef(onUpdate); update.current = onUpdate;
  const hasWork = progress.pending > 0;
  const tr = (fr: string, english: string) => en ? english : fr;
  useEffect(() => {
    if (!enabled || paused || (!hasWork && !retryFailed.current)) { setRunning(false); return; }
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
          budget.current -= 1;
          if (budget.current <= 0 && !searchingRef.current) { setPaused(true); break; }
        }
      } catch { if (active) setError(en ? "Image reading paused. Try again to continue." : "Lecture des images interrompue. Réessaie pour continuer."); }
      finally { if (active) setRunning(false); }
    })();
    return () => { active = false; };
  }, [accountKey, range, paused, hasWork, attempt, priorityPostId, en, enabled]);
  // Chercher du texte, c'est demander la lecture : elle reprend, sans plafond.
  useEffect(() => { if (searching && paused && hasWork) { budget.current = Infinity; setPaused(false); } }, [searching, paused, hasWork]);
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  // La lecture des slides tourne en fond : sa progression n'interesse que
  // celui qui cherche du texte. Sans recherche, la barre reste un simple champ.
  const showStatus = searching && (Boolean(error) || progress.pending > 0 || progress.failed > 0);
  return <div className="ss-text-search">
    <div className="ss-text-search__field">
      <svg className="ss-text-search__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input className="ss-input ss-acc__search" type="search" value={query} onChange={e => onQuery(e.target.value)}
        aria-label={tr("Chercher dans le texte des slides", "Search slide text")}
        title={tr("Texte visible sur les slides et couvertures. Les légendes ne sont pas recherchées.", "Visible text on slides and covers. Captions are not searched.")}
        placeholder={tr("Chercher un hook ou un texte de slide…", "Search a hook or slide text…")} />
      <div className="ss-acc__range" role="group" aria-label={tr("Où chercher", "Search scope")}>
        <button type="button" className={!hookOnly ? "is-on" : ""} aria-pressed={!hookOnly} onClick={() => onScope(false)}>{tr("Toutes les slides", "All slides")}</button>
        <button type="button" className={hookOnly ? "is-on" : ""} aria-pressed={hookOnly} onClick={() => onScope(true)}>{tr("Hook seul", "Hook only")}</button>
      </div>
    </div>
    {showStatus ? <div className={`ss-text-search__status${error ? " is-error" : ""}`}>
      <span className="ss-text-search__bar" aria-hidden><i style={{ width: `${pct}%` }} /></span>
      <span role="status">{error || (running && !paused
        ? tr(`Lecture des slides ${progress.done}/${progress.total}`, `Reading slides ${progress.done}/${progress.total}`)
        : progress.pending ? tr(`Lecture en pause · ${progress.done}/${progress.total}`, `Reading paused · ${progress.done}/${progress.total}`)
        : tr(`${progress.failed} images indisponibles`, `${progress.failed} unavailable images`))}
        {!error && progress.uncertain > 0 && progress.pending > 0 ? tr(` · ${progress.uncertain} incertaines`, ` · ${progress.uncertain} uncertain`) : ""}
      </span>
      {progress.pending > 0 ? <button type="button" className="ss-text-search__action" onClick={() => { budget.current = Infinity; if (error) { setAttempt(n => n + 1); setPaused(false); } else setPaused(v => !v); }}>
        {tr(error ? "Réessayer" : paused ? "Reprendre" : "Pause", error ? "Retry" : paused ? "Resume" : "Pause")}</button> : null}
      {!progress.pending && progress.failed > 0 ? <button type="button" className="ss-text-search__action" onClick={() => { retryFailed.current = true; setPaused(false); setAttempt(n => n + 1); }}>{tr("Relire", "Retry")}</button> : null}
    </div> : null}
  </div>;
}
