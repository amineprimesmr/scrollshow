"use client";

import type { Account } from "@/lib/types";
import type { FormatStudy } from "@/lib/research/model";
import type { getStudy } from "@/lib/research/formats";
import type { publicJob } from "@/lib/research/jobs";
import type { researchMetrics } from "@/lib/research/statistics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { coverSrc } from "./cover";
import { useStudio } from "./StudioContext";
import "./research.css";

type Metrics = ReturnType<typeof researchMetrics>;
type Item = { account: Account; metrics: Metrics; measuredAt: string | null };
type Job = ReturnType<typeof publicJob>;
type Study = Awaited<ReturnType<typeof getStudy>>;
type Tab = "accounts" | "formats";

const LIVE = new Set(["queued", "running"]);

async function api(url: string, body?: unknown) {
  const res = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "request_failed");
  return json;
}

export function ResearchView() {
  const { english } = useStudio();
  const tr = useCallback((fr: string, en: string) => (english ? en : fr), [english]);

  const [items, setItems] = useState<Item[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [studies, setStudies] = useState<FormatStudy[]>([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("accounts");

  // Une seule zone de saisie : « @compte » analyse ce compte, tout le reste
  // cherche des comptes. Les reglages fins restent replies.
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("provider");
  const [days, setDays] = useState(30);
  const [target, setTarget] = useState(10);
  const [minViews, setMinViews] = useState(100000);
  const [minMedian, setMinMedian] = useState(0);
  const [minShare, setMinShare] = useState(50);
  const [minPosts, setMinPosts] = useState(5);
  const [maxPages, setMaxPages] = useState(3);
  const [pivot, setPivot] = useState(false);

  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("median");
  const [study, setStudy] = useState<Study | null>(null);
  const [studying, setStudying] = useState(false);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [history, setHistory] = useState(false);

  const load = useCallback(async () => {
    try {
      const [library, runs, formats] = await Promise.all([
        api(`/api/research?days=${days}`),
        api("/api/research/jobs"),
        api("/api/research/studies"),
      ]);
      setItems(library.items);
      setAvailable(library.discoveryAvailable);
      setJobs(runs.jobs);
      setStudies(formats.studies);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const running = useMemo(() => jobs.filter((job) => LIVE.has(job.status)), [jobs]);
  const active = running[0] || null;
  const activeId = active?.id || null;

  // Tant qu'une recherche tourne : on rafraichit vite (les comptes arrivent au
  // fur et a mesure) et on pousse l'etape suivante des que le bail est libre.
  // Au repos on rafraichit lentement : une recherche lancee ailleurs (agent,
  // cron, autre onglet) doit finir par apparaitre ici sans rechargement.
  useEffect(() => {
    if (activeId) return;
    const idle = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(idle);
  }, [activeId, load]);

  const pumping = useRef(false);
  useEffect(() => {
    if (!activeId) return;
    let live = true;
    const poll = window.setInterval(() => {
      if (live) void load();
    }, 2500);
    const pump = window.setInterval(async () => {
      if (pumping.current) return;
      pumping.current = true;
      try {
        await api(`/api/research/jobs/${activeId}`, { action: "advance" });
      } catch {
        // Un bail encore actif ou une erreur reseau : le prochain tour reessaie.
      } finally {
        pumping.current = false;
      }
    }, 3000);
    return () => {
      live = false;
      window.clearInterval(poll);
      window.clearInterval(pump);
    };
  }, [activeId, load]);

  const num = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString(english ? "en-US" : "fr-FR"));
  const compactNum = (n: number | null | undefined) => {
    if (n == null) return "—";
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`;
    return String(Math.round(n));
  };
  const percent = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100)} %`);

  const statusName = (s: string) =>
    ({
      queued: tr("En attente", "Queued"),
      running: tr("En cours", "Running"),
      done: tr("Terminée", "Done"),
      paused: tr("En pause", "Paused"),
      needs_attention: tr("Intervention requise", "Needs attention"),
      stopped: tr("Arrêtée", "Stopped"),
      error: tr("Erreur", "Error"),
    })[s] || s;

  const reasonName = (s: string) =>
    ({
      no_posts_in_window: tr("Aucun post dans la période", "No posts in period"),
      insufficient_slideshows: tr("Pas assez de carrousels mesurés", "Too few measured carousels"),
      slideshow_share_below_filter: tr("Trop peu de carrousels", "Too few carousels"),
      median_views_below_filter: tr("Médiane sous le seuil", "Median below threshold"),
      total_views_below_filter: tr("Vues cumulées sous le seuil", "Total views below threshold"),
      followers_below_filter: tr("Abonnés sous le seuil", "Followers below threshold"),
      followers_unavailable: tr("Abonnés non mesurés", "Followers unavailable"),
    })[s] || s;

  const filters = () => ({ days, minSlideshowShare: minShare / 100, minMedianViews: minMedian, minTotalViews: minViews, minPosts });

  async function start(event: React.FormEvent) {
    event.preventDefault();
    const words = query.split(/[,\n]/).map((word) => word.trim()).filter(Boolean);
    if (!words.length) return;
    const kind = words.every((word) => word.startsWith("@")) ? "analyze" : "discover";
    setBusy(true);
    setError("");
    try {
      const job = await api("/api/research/jobs", {
        kind,
        source,
        keywords: words,
        target,
        maxPages,
        hashtagPivot: pivot,
        filters: filters(),
        requestId: crypto.randomUUID(),
      });
      setOpenRun(job.id);
      setTab("accounts");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "research_failed");
    } finally {
      setBusy(false);
    }
  }

  async function control(id: string, action: string, retune = false) {
    try {
      await api(`/api/research/jobs/${id}`, { action, ...(retune ? { filters: filters() } : {}) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "research_failed");
    }
  }

  async function openStudy(accountId: string, postId: string) {
    setStudying(true);
    setError("");
    try {
      setStudy(await api("/api/research/studies", { accountId, postId }));
      setTab("formats");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "study_failed");
    } finally {
      setStudying(false);
    }
  }

  async function continueStudy() {
    if (!study) return;
    setStudying(true);
    try {
      setStudy(await api(`/api/research/studies/${study.id}`, {}));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "study_failed");
    } finally {
      setStudying(false);
    }
  }

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return items
      .filter((item) => `${item.account.handle} ${item.account.bio || ""} ${item.account.niche} ${item.account.notes}`.toLowerCase().includes(needle))
      .sort((a, b) =>
        sort === "followers"
          ? b.account.followers - a.account.followers
          : sort === "ratio"
            ? (b.metrics.medianViewsPerFollower ?? -1) - (a.metrics.medianViewsPerFollower ?? -1)
            : (b.metrics.medianViews ?? -1) - (a.metrics.medianViews ?? -1),
      );
  }, [items, filter, sort]);

  // Comptes deja mesures par la recherche en cours : ils passent devant, avec
  // leur verdict, pour qu'on voie le travail arriver plutot qu'un total final.
  const freshHandles = useMemo(() => new Set((active?.results || []).map((r) => r.handle)), [active]);
  const pending = useMemo(() => {
    if (!active) return [];
    const known = new Set([...freshHandles, ...items.map((item) => item.account.handle)]);
    return active.pending.filter((candidate) => !known.has(candidate.handle));
  }, [active, freshHandles, items]);

  const shown = useMemo(() => {
    if (!active) return visible;
    return [...visible].sort((a, b) => Number(freshHandles.has(b.account.handle)) - Number(freshHandles.has(a.account.handle)));
  }, [visible, active, freshHandles]);

  const verdictOf = (handle: string) => (active?.results || []).find((r) => r.handle === handle) || null;

  return (
    <div className="ss-research">
      <section className="ss-research-hero">
        <h1>{tr("Trouve les comptes qui marchent dans ta niche", "Find the accounts that work in your niche")}</h1>
        <p>{tr("Une recherche mesure les carrousels publics des comptes trouvés, garde ceux qui tiennent la route et te montre leurs meilleurs posts.", "A search measures public carousels of the accounts it finds, keeps the ones that hold up, and shows you their best posts.")}</p>
        <form onSubmit={start} className="ss-research-search">
          <input
            className="ss-research-search__input"
            required
            minLength={2}
            maxLength={1500}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tr("ta niche : routine sommeil, astuces révision… ou @uncompte", "your niche: sleep routine, study tips… or @anaccount")}
            aria-label={tr("Niche ou compte", "Niche or account")}
          />
          <button className="ss-btn-purple lg-press" disabled={busy || (source === "provider" && !available)}>
            {busy ? tr("Démarrage…", "Starting…") : tr("Chercher", "Search")}
          </button>
        </form>
        <p className="ss-research-hint">
          {query.trim().split(/[,\n]/).filter(Boolean).every((word) => word.trim().startsWith("@")) && query.trim()
            ? tr("Ces comptes seront mesurés directement.", "These accounts will be measured directly.")
            : tr("Sépare plusieurs idées par des virgules. Commence par @ pour analyser un compte précis.", "Separate ideas with commas. Start with @ to analyse a specific account.")}
        </p>

        <details className="ss-research-advanced">
          <summary>{tr("Réglages", "Settings")}</summary>
          <div className="ss-research-advanced__grid">
            <label>
              {tr("Source", "Source")}
              <select className="ss-input" value={source} onChange={(event) => setSource(event.target.value)}>
                <option value="provider" disabled={!available}>{tr("Collecte cloud", "Cloud collection")}</option>
                <option value="browser">{tr("Mon navigateur", "My browser")}</option>
              </select>
            </label>
            {[
              { label: tr("Période (jours)", "Period (days)"), value: days, set: setDays, min: 1, max: 365 },
              { label: tr("Comptes voulus", "Target accounts"), value: target, set: setTarget, min: 1, max: 50 },
              { label: tr("Carrousels minimum (%)", "Minimum carousels (%)"), value: minShare, set: setMinShare, min: 0, max: 100 },
              { label: tr("Vues cumulées minimum", "Minimum total views"), value: minViews, set: setMinViews, min: 0, max: 1e12 },
              { label: tr("Vues médianes minimum", "Minimum median views"), value: minMedian, set: setMinMedian, min: 0, max: 1e10 },
              { label: tr("Carrousels mesurés minimum", "Minimum measured carousels"), value: minPosts, set: setMinPosts, min: 1, max: 100 },
              { label: tr("Pages max par compte", "Max pages per account"), value: maxPages, set: setMaxPages, min: 1, max: 10 },
            ].map((field) => (
              <label key={field.label}>
                {field.label}
                <input className="ss-input" type="number" required min={field.min} max={field.max} value={field.value} onChange={(event) => field.set(Number(event.target.value))} />
              </label>
            ))}
            <label className="ss-research-advanced__check">
              <input type="checkbox" checked={pivot} onChange={(event) => setPivot(event.target.checked)} />
              {tr("Explorer les hashtags trouvés", "Explore discovered hashtags")}
            </label>
          </div>
          {source === "browser" ? (
            <p className="ss-research-note">
              {tr("Le collecteur local doit tourner sur ton Mac. Ta session TikTok reste dans son profil Chrome dédié.", "The local collector must run on your Mac. Your TikTok session stays in its dedicated Chrome profile.")}{" "}
              <a href="/research-collector.md" target="_blank" rel="noreferrer">{tr("Configurer", "Set up")}</a>
            </p>
          ) : null}
        </details>

        {!available && source === "provider" ? (
          <p className="ss-research-note" role="status">
            {tr("La collecte cloud n’est pas configurée. Passe sur ton collecteur navigateur dans les réglages.", "Cloud collection is not configured. Switch to your browser collector in the settings.")}
          </p>
        ) : null}
      </section>

      {error ? (
        <div className="ss-research-error" role="alert">
          <span>{error}</span>
          <button className="ss-btn-ghost" type="button" onClick={() => setError("")}>{tr("Fermer", "Dismiss")}</button>
        </div>
      ) : null}

      {running.map((job) => (
        <RunLive
          key={job.id}
          job={job}
          tr={tr}
          statusName={statusName}
          onPause={() => void control(job.id, "pause")}
          onStop={() => void control(job.id, "stop")}
        />
      ))}

      {jobs
        .filter((job) => ["paused", "needs_attention", "error"].includes(job.status))
        .map((job) => (
          <div key={job.id} className="ss-research-paused" role="status">
            <div>
              <strong>{statusName(job.status)}</strong>
              <span>{job.input.keywords.slice(0, 3).join(", ")}{job.error ? ` · ${job.error}` : ""}</span>
            </div>
            <div className="ss-research-paused__actions">
              <button className="ss-btn-ghost" type="button" onClick={() => void control(job.id, "resume")}>{tr("Reprendre", "Resume")}</button>
              <button className="ss-btn-ghost" type="button" onClick={() => void control(job.id, "resume", true)}>{tr("Reprendre avec mes réglages", "Resume with my settings")}</button>
              <button className="ss-btn-ghost" type="button" onClick={() => void control(job.id, "stop")}>{tr("Arrêter", "Stop")}</button>
            </div>
          </div>
        ))}

      <nav className="ss-research-tabs lg lg--flat" aria-label={tr("Vues", "Views")}>
        {(
          [
            ["accounts", tr("Comptes", "Accounts"), items.length],
            ["formats", tr("Formats étudiés", "Studied formats"), studies.length],
          ] as const
        ).map(([id, label, count]) => (
          <button key={id} type="button" className={tab === id ? "ss-btn-purple" : "ss-btn-ghost"} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label} <span>{count}</span>
          </button>
        ))}
      </nav>

      {tab === "accounts" ? (
        <>
          <div className="ss-research-toolbar">
            <input className="ss-input" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={tr("Filtrer les comptes", "Filter accounts")} aria-label={tr("Filtrer les comptes", "Filter accounts")} />
            <select className="ss-input" value={sort} onChange={(event) => setSort(event.target.value)} aria-label={tr("Classer par", "Sort by")}>
              <option value="median">{tr("Vues médianes", "Median views")}</option>
              <option value="ratio">{tr("Vues / abonné", "Views / follower")}</option>
              <option value="followers">{tr("Abonnés", "Followers")}</option>
            </select>
            <a className="ss-btn-ghost" href="/app/mcp">{tr("Bâtir ma stratégie", "Build my strategy")}</a>
          </div>

          {loading ? (
            <div className="ss-research-grid">{[0, 1, 2].map((i) => <SkeletonCard key={i} />)}</div>
          ) : null}

          {!loading && !shown.length && !pending.length ? (
            <section className="ss-research-empty">
              <h3>{tr("Rien à montrer pour l’instant", "Nothing to show yet")}</h3>
              <p>{tr("Lance une recherche ci-dessus : les comptes apparaissent ici dès qu’ils sont trouvés, puis se remplissent avec leurs chiffres.", "Start a search above: accounts appear here as soon as they are found, then fill in with their numbers.")}</p>
            </section>
          ) : null}

          <div className="ss-research-grid">
            {shown.map(({ account, metrics, measuredAt }) => (
              <AccountCard
                key={account.id}
                account={account}
                metrics={metrics}
                measuredAt={measuredAt}
                verdict={verdictOf(account.handle)}
                fresh={freshHandles.has(account.handle)}
                tr={tr}
                num={num}
                compactNum={compactNum}
                percent={percent}
                reasonName={reasonName}
                studying={studying}
                onStudy={openStudy}
                english={english}
              />
            ))}
            {pending.map((candidate) => (
              <article className="ss-research-card is-pending" key={candidate.handle} aria-busy="true">
                <header>
                  <span className="ss-research-card__avatar" aria-hidden />
                  <span className="ss-research-card__id">
                    <b>@{candidate.handle}</b>
                    <span>{tr("mesure en attente", "waiting to be measured")}</span>
                  </span>
                </header>
                <div className="ss-research-card__bars" aria-hidden>
                  <i /><i /><i />
                </div>
              </article>
            ))}
          </div>

          {jobs.length ? (
            <details className="ss-research-history" open={history} onToggle={(event) => setHistory(event.currentTarget.open)}>
              <summary>{tr("Historique des recherches", "Search history")} ({jobs.length})</summary>
              <ul>
                {jobs.map((job) => (
                  <li key={job.id}>
                    <button type="button" className="ss-btn-ghost" onClick={() => setOpenRun(openRun === job.id ? null : job.id)}>
                      {job.input.keywords.slice(0, 3).join(", ") || job.id.slice(0, 8)}
                    </button>
                    <span>
                      {statusName(job.status)} · {job.progress.accepted}/{job.progress.target} {tr("retenus", "kept")} · {new Date(job.createdAt).toLocaleDateString(english ? "en-US" : "fr-FR")}
                    </span>
                    {openRun === job.id ? (
                      <div className="ss-research-history__detail">
                        {job.results.length ? (
                          <table className="ss-research-table">
                            <thead>
                              <tr>
                                <th>{tr("Compte", "Account")}</th>
                                <th>{tr("Médiane", "Median")}</th>
                                <th>{tr("Carrousels", "Carousels")}</th>
                                <th>{tr("Résultat", "Result")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {job.results.map((result) => (
                                <tr key={result.handle}>
                                  <td>
                                    <a href={`https://www.tiktok.com/@${result.handle}`} target="_blank" rel="noreferrer">@{result.handle}</a>
                                    <small>{result.coverage.complete ? tr("Période couverte", "Period covered") : tr("Échantillon partiel", "Partial sample")}</small>
                                  </td>
                                  <td>{num(result.metrics.medianViews)}</td>
                                  <td>{result.metrics.measuredSlideshowPosts}</td>
                                  <td>{result.accepted ? tr("Retenu", "Kept") : result.reasons.map(reasonName).join(" · ")}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p>{tr("Aucun compte mesuré dans cette recherche.", "No account measured in this search.")}</p>
                        )}
                        {job.input.source === "browser" ? (
                          <p>{tr("Identifiant pour le collecteur : ", "Collector job ID: ")}<code>{job.id}</code></p>
                        ) : null}
                        {job.failures.length ? (
                          <details>
                            <summary>{tr("Erreurs conservées", "Saved errors")} ({job.failures.length})</summary>
                            {job.failures.map((failure, index) => (
                              <p key={index}>{failure.handle || failure.keyword} : {failure.error}</p>
                            ))}
                          </details>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}

      {tab === "formats" ? (
        <>
          {!studies.length && !study ? (
            <section className="ss-research-empty">
              <h3>{tr("Lis un format, pas seulement ses chiffres", "Read a format, beyond its numbers")}</h3>
              <p>{tr("Dans Comptes, ouvre les carrousels d’un profil puis choisis « Étudier ». L’étude garde chaque slide et son texte ; ton assistant peut ajouter son interprétation sourcée.", "Under Accounts, open a profile’s carousels and choose “Study”. The study keeps every slide and its text; your assistant can add an evidence-backed interpretation.")}</p>
            </section>
          ) : null}

          {studies.length ? (
            <div className="ss-research-study-list">
              {studies.map((row) => (
                <button
                  className={`ss-btn-ghost ${study?.id === row.id ? "is-on" : ""}`}
                  key={row.id}
                  type="button"
                  onClick={() => void api(`/api/research/studies/${row.id}`).then(setStudy).catch((err) => setError(err.message))}
                >
                  {row.interpretation?.name || row.caption.slice(0, 65) || row.postId} · {row.slides.length} slides
                </button>
              ))}
            </div>
          ) : null}

          {study ? (
            <section className="ss-research-study">
              <div className="ss-research-study__head">
                <div>
                  <h3>{study.interpretation?.name || tr("Étude du carrousel", "Carousel study")}</h3>
                  <a href={study.sourceUrl} target="_blank" rel="noreferrer">{tr("Publication d’origine", "Original post")}</a>
                  <p>
                    {num(study.post?.views)} {tr("vues", "views")} · {tr("médiane du compte ", "account median ")}{num(study.baseline.medianViews)}
                    {study.lift !== null ? ` · ×${study.lift.toFixed(1)}` : ""}
                  </p>
                </div>
                <div className="ss-research-study__actions">
                  <a className="ss-btn-ghost" href={`/api/research/studies/${study.id}/export`}>{tr("Télécharger (ZIP)", "Download (ZIP)")}</a>
                  {study.status === "pending" ? (
                    <button className="ss-btn-purple" type="button" disabled={studying} onClick={() => void continueStudy()}>
                      {studying ? tr("Lecture…", "Reading…") : tr("Lire les slides suivantes", "Read remaining slides")}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="ss-research-slides">
                {study.slides.map((slide) => (
                  <article key={slide.index}>
                    <img src={coverSrc(slide.image)} alt={`Slide ${slide.index}`} loading="lazy" />
                    <strong>Slide {slide.index}</strong>
                    <small>
                      {slide.status === "pending"
                        ? tr("À lire", "Pending")
                        : slide.status === "unreadable"
                          ? tr("Transcription incertaine", "Uncertain transcript")
                          : `OCR ${num(slide.confidence)} %`}
                    </small>
                    <p>{slide.text}</p>
                  </article>
                ))}
              </div>

              {study.interpretation ? (
                <div className="ss-research-interpretation">
                  <h4>{tr("Interprétation de l’assistant", "Assistant interpretation")}</h4>
                  {[
                    [tr("Accroche", "Hook"), study.interpretation.hook],
                    [tr("Narration", "Narrative"), study.interpretation.narrative],
                    [tr("Motif visuel", "Visual pattern"), study.interpretation.visualPattern],
                    [tr("Émotion et audience", "Emotion and audience"), `${study.interpretation.emotionalAngle} — ${study.interpretation.audience}`],
                    [tr("Appel à l’action", "Call to action"), study.interpretation.cta],
                    [tr("Adaptation à ton activité", "Business adaptation"), study.interpretation.adaptation],
                    [tr("Hypothèse à tester", "Hypothesis to test"), study.interpretation.hypothesis],
                  ].map(([label, text]) => (
                    <div key={label}>
                      <strong>{label}</strong>
                      <p>{text}</p>
                    </div>
                  ))}
                  <p className="ss-research-note">{tr("Slides citées : ", "Cited slides: ")}{study.interpretation.evidenceSlides.join(", ")}</p>
                </div>
              ) : (
                <p className="ss-research-note">
                  {tr("Les preuves sont prêtes pour ton assistant. Demande-lui d’analyser cette étude et d’enregistrer le format avec ses sources.", "Evidence is ready for your assistant. Ask it to analyse this study and save the format with its sources.")}
                </p>
              )}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Bandeau vivant : ce que la recherche fait maintenant, et ou elle en est. */
function RunLive({
  job,
  tr,
  statusName,
  onPause,
  onStop,
}: {
  job: Job;
  tr: (fr: string, en: string) => string;
  statusName: (s: string) => string;
  onPause: () => void;
  onStop: () => void;
}) {
  const { progress, current } = job;
  const done = Math.min(progress.accepted, progress.target);
  const ratio = progress.target ? done / progress.target : 0;
  const line = current.label
    ? current.kind === "search"
      ? tr(`Recherche de comptes pour « ${current.label} »`, `Searching accounts for “${current.label}”`)
      : tr(`Mesure de @${current.label}`, `Measuring @${current.label}`)
    : tr("Préparation…", "Preparing…");

  return (
    <section className="ss-research-live" aria-live="polite">
      <div className="ss-research-live__head">
        <span className="ss-research-live__spinner" aria-hidden />
        <div>
          <strong>{line}</strong>
          <span>
            {statusName(job.status)} · {job.input.keywords.slice(0, 3).join(", ")}
          </span>
        </div>
        <div className="ss-research-live__actions">
          <button className="ss-btn-ghost lg-press" type="button" onClick={onPause}>{tr("Pause", "Pause")}</button>
          <button className="ss-btn-ghost lg-press" type="button" onClick={onStop}>{tr("Arrêter", "Stop")}</button>
        </div>
      </div>

      <div className="ss-research-live__bar" role="progressbar" aria-valuemin={0} aria-valuemax={progress.target} aria-valuenow={done}>
        <i style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>

      <dl className="ss-research-live__stats">
        {[
          [tr("mots-clés", "keywords"), `${progress.keywordsDone}/${progress.keywordsTotal}`],
          [tr("comptes trouvés", "accounts found"), String(progress.candidates)],
          [tr("mesurés", "measured"), String(progress.measured)],
          [tr("retenus", "kept"), `${progress.accepted}/${progress.target}`],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SkeletonCard() {
  return (
    <article className="ss-research-card is-pending" aria-hidden>
      <header>
        <span className="ss-research-card__avatar" />
        <span className="ss-research-card__id">
          <b />
          <span />
        </span>
      </header>
      <div className="ss-research-card__bars">
        <i /><i /><i />
      </div>
    </article>
  );
}

function AccountCard({
  account,
  metrics,
  measuredAt,
  verdict,
  fresh,
  tr,
  num,
  compactNum,
  percent,
  reasonName,
  studying,
  onStudy,
  english,
}: {
  account: Account;
  metrics: Metrics;
  measuredAt: string | null;
  verdict: { accepted: boolean; reasons: string[] } | null;
  fresh: boolean;
  tr: (fr: string, en: string) => string;
  num: (n: number | null | undefined) => string;
  compactNum: (n: number | null | undefined) => string;
  percent: (n: number | null | undefined) => string;
  reasonName: (s: string) => string;
  studying: boolean;
  onStudy: (accountId: string, postId: string) => void;
  english: boolean;
}) {
  const top = metrics.topPosts.slice(0, 4);
  return (
    <article className={`ss-research-card ${fresh ? "is-fresh" : ""}`}>
      <header>
        {account.avatar ? (
          <img className="ss-research-card__avatar" src={coverSrc(account.avatar)} alt="" loading="lazy" />
        ) : (
          <span className="ss-research-card__avatar" aria-hidden />
        )}
        <span className="ss-research-card__id">
          <b>
            <a href={`https://www.tiktok.com/@${account.handle}`} target="_blank" rel="noreferrer">@{account.handle}</a>
          </b>
          <span>{account.niche || account.bio || tr("Sans description", "No description")}</span>
        </span>
        {verdict ? (
          <span className={`ss-research-card__verdict ${verdict.accepted ? "is-ok" : "is-out"}`}>
            {verdict.accepted ? tr("Retenu", "Kept") : reasonName(verdict.reasons[0] || "")}
          </span>
        ) : null}
      </header>

      <dl className="ss-research-card__stats">
        {[
          [tr("abonnés", "followers"), compactNum(account.followers)],
          [tr("vues médianes", "median views"), compactNum(metrics.medianViews)],
          [tr("carrousels", "carousels"), percent(metrics.slideshowShare)],
          [tr("mesurés", "measured"), String(metrics.measuredSlideshowPosts)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {metrics.confidence === "insufficient_data" ? (
        <p className="ss-research-card__signal">{tr("Trop peu de carrousels pour conclure.", "Too few carousels to conclude.")}</p>
      ) : metrics.repeatability === "single_post_dominated" ? (
        <p className="ss-research-card__signal">{tr("La majorité des vues vient d’un seul post.", "Most views come from a single post.")}</p>
      ) : null}

      {top.length ? (
        <div className="ss-research-card__posts">
          <h4>{tr("Ses meilleurs carrousels", "Its best carousels")}</h4>
          <ul>
            {top.map((post) => (
              <li key={post.id}>
                <a href={post.url} target="_blank" rel="noreferrer" title={post.title || post.id}>
                  {post.cover ? <img src={coverSrc(post.cover)} alt="" loading="lazy" /> : <span className="ss-research-card__nocover" aria-hidden />}
                  <b>{compactNum(post.views)}</b>
                </a>
                <button
                  className="ss-btn-ghost"
                  type="button"
                  disabled={studying || !post.images?.length}
                  onClick={() => onStudy(account.id, post.id)}
                  title={post.images?.length ? tr("Étudier le format", "Study format") : tr("Pas de slides à lire", "No slides to read")}
                >
                  {tr("Étudier", "Study")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <footer>
        {measuredAt ? new Date(measuredAt).toLocaleDateString(english ? "en-US" : "fr-FR") : tr("Non mesuré", "Not measured")}
        {" · "}
        {account.researchCoverage?.complete ? tr("période couverte", "period covered") : tr("échantillon partiel", "partial sample")}
        {" · "}
        {num(metrics.samplePosts)} {tr("posts vus", "posts seen")}
      </footer>
    </article>
  );
}
