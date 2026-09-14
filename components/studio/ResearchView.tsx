"use client";

import type { Account, AccountVideo } from "@/lib/types";
import type { publicJob } from "@/lib/research/jobs";
import type { researchMetrics } from "@/lib/research/statistics";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { t } from "@/lib/i18n";
import { useStudio } from "./StudioContext";
import { PostTile } from "./PostTile";
import { PostViewer } from "./PostViewer";
import { TikTokScanLine } from "./TikTokScan";
import { IconCheck } from "./icons";
import { keepErrorLabel, keepInLibrary } from "./library-drop";
import { useKeepDrag } from "./useKeepDrag";
import { filterResearchPosts, mergeResearchJobs, researchDateBounds, researchHistogram, type ResearchPostRow } from "./research-state";
import { Metal } from "@/components/fx/Metal";
import { Orb } from "@/components/fx/Orb";
import "./research.css";

type Metrics = ReturnType<typeof researchMetrics>;
type Item = { account: Account; metrics: Metrics; measuredAt: string | null };
type Job = ReturnType<typeof publicJob> & { hasPostDetails?: boolean; reused?: boolean; cachedAt?: string };
type Row = ResearchPostRow & { metrics: Metrics | null };

const LIVE = new Set(["queued", "running"]);
const PAGE = 24;
type DisplayFilters = { minPostViews: number; maxPostViews: number | null; days: number; dateFrom: string; dateTo: string };
const ALL_FILTERS: DisplayFilters = { minPostViews: 0, maxPostViews: null, days: 0, dateFrom: "", dateTo: "" };
type CachedResearch = { jobs: Job[]; items: Item[]; available: boolean; at: number };
const researchCache = new Map<string, CachedResearch>();
const cachedResearch = (key: string) => {
  const cached = researchCache.get(key);
  return cached && Date.now() - cached.at < 15 * 60_000 ? cached : undefined;
};
const shortNumber = (value: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const inputDate = (value: number) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

async function api(url: string, body?: unknown, signal?: AbortSignal, timeout = 25_000) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      ...(body !== undefined ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      signal: controller.signal,
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "request_failed");
    return json;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error("request_timeout");
    throw error;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

/** Un post merite d'etre signale quand il depasse deux fois ce que son compte
 *  fait d'habitude. Garde reprise du moteur : sans mediane connue et sans
 *  echantillon suffisant, le multiple serait un mensonge chiffre. */
function liftOf(post: AccountVideo, metrics: Metrics | null) {
  if (!metrics?.medianViews || metrics.medianViews <= 0 || metrics.measuredSlideshowPosts < 5) return null;
  const lift = post.views / metrics.medianViews;
  return lift >= 2 ? lift : null;
}

function Histogram({ data, date = false, english, bounds }: { data: ReturnType<typeof researchHistogram>; date?: boolean; english: boolean; bounds?: { min: number; max: number | null } }) {
  const label = (value: number) => date ? new Intl.DateTimeFormat(english ? "en-GB" : "fr-FR", { day: "numeric", month: "short", year: "2-digit" }).format(value) : shortNumber(value);
  const peak = Math.max(1, ...data.bins.map((bin) => bin.count));
  return (
    <div className="ss-rs__histogram">
      {data.known ? (
        <>
          <svg viewBox="0 0 288 56" preserveAspectRatio="none" role="img" aria-label={english ? `Distribution of ${data.known} measured carousels` : `Répartition de ${data.known} carrousels mesurés`}>
            {data.bins.map((bin, index) => {
              const width = 288 / data.bins.length;
              const height = bin.count ? Math.max(2, bin.count / peak * 52) : 0;
              const included = !bounds || (bin.max >= bounds.min && (bounds.max == null || bin.min <= bounds.max));
              return <rect key={index} x={index * width + 1} y={56 - height} width={Math.max(1, width - 3)} height={height} rx="2" style={{ opacity: included ? 0.72 : 0.16 }}><title>{label(bin.min)} – {label(bin.max)} : {bin.count}</title></rect>;
            })}
          </svg>
          <div className="ss-rs__histogram-axis"><span>{label(data.min!)}</span><span>{label(data.max!)}</span></div>
        </>
      ) : <p>{english ? "No measured values yet" : "Aucune mesure pour le moment"}</p>}
      <small>{data.known} {english ? "measured carousels" : "carrousels mesurés"}{data.unknown ? ` · ${data.unknown} ${english ? "unknown" : "inconnus"}` : ""}</small>
    </div>
  );
}

function ResearchFilters({ rows, value, onChange, english }: {
  rows: Row[]; value: DisplayFilters; onChange: (value: DisplayFilters) => void; english: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const tr = (fr: string, en: string) => english ? en : fr;
  const views = useMemo(() => researchHistogram(rows, "views"), [rows]);
  const dates = useMemo(() => researchHistogram(rows, "date"), [rows]);
  const logLow = Math.log10((views.min ?? 0) + 1);
  const logSpan = Math.log10((views.max ?? 0) + 1) - logLow;
  const position = (number: number) => logSpan > 0 ? Math.round(Math.max(0, Math.min(1, (Math.log10(number + 1) - logLow) / logSpan)) * 1000) : 0;
  const minimumPosition = position(value.minPostViews);
  const maximumPosition = value.maxPostViews == null ? 1000 : position(value.maxPostViews);
  const active = Number(value.minPostViews > 0 || value.maxPostViews != null) + Number(value.days > 0 || Boolean(value.dateFrom || value.dateTo));
  useEffect(() => {
    if (!open) return;
    const down = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <div className="ss-rs__filter" ref={box}>
      <button type="button" ref={trigger} className={`ss-rs__filter-button lg lg--lens lg-press${active ? " is-on" : ""}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((current) => !current)}>
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14"/><circle cx="7" cy="5" r="2"/><circle cx="13" cy="10" r="2"/><circle cx="8" cy="15" r="2"/></svg>
        {tr("Filtres", "Filters")}{active ? <b>{active}</b> : null}
      </button>
      {open ? (
        <div className="ss-rs__filter-panel lg" role="dialog" aria-label={tr("Filtrer les carrousels", "Filter carousels")}>
          <div className="ss-rs__filter-heading"><strong>{tr("Filtres", "Filters")}</strong><button type="button" onClick={() => onChange({ ...ALL_FILTERS })}>{tr("Réinitialiser", "Reset")}</button></div>
          <section>
            <h2>{tr("Nombre de vues", "View count")}</h2>
            <Histogram data={views} english={english} bounds={{ min: value.minPostViews, max: value.maxPostViews }} />
            <div className="ss-rs__view-range" style={{ "--range-from": `${minimumPosition / 10}%`, "--range-to": `${maximumPosition / 10}%` } as CSSProperties}>
              <span aria-hidden="true" />
              <input type="range" min="0" max="1000" step="1" disabled={!logSpan} value={minimumPosition} aria-label={tr("Minimum vues graphique", "Graph minimum views")} aria-valuetext={shortNumber(value.minPostViews)} onChange={(event) => {
                const next = Math.min(Number(event.target.value), maximumPosition);
                const min = next === 0 ? 0 : Math.ceil(10 ** (logLow + logSpan * next / 1000) - 1);
                onChange({ ...value, minPostViews: min, maxPostViews: value.maxPostViews != null && value.maxPostViews < min ? min : value.maxPostViews });
              }} />
              <input type="range" min="0" max="1000" step="1" disabled={!logSpan} value={maximumPosition} aria-label={tr("Maximum vues graphique", "Graph maximum views")} aria-valuetext={value.maxPostViews == null ? tr("Illimité", "No limit") : shortNumber(value.maxPostViews)} onChange={(event) => {
                const next = Math.max(Number(event.target.value), minimumPosition);
                const max = next === 1000 ? null : Math.floor(10 ** (logLow + logSpan * next / 1000) - 1);
                onChange({ ...value, maxPostViews: max, minPostViews: max != null && value.minPostViews > max ? max : value.minPostViews });
              }} />
            </div>
            <div className="ss-rs__filter-inputs">
              <label>{tr("Minimum", "Minimum")}<input type="number" inputMode="numeric" min="0" step="100" aria-label={tr("Vues minimum", "Minimum views")} placeholder="0" value={value.minPostViews || ""} onChange={(event) => {
                const min = Math.max(0, Number(event.target.value) || 0);
                onChange({ ...value, minPostViews: min, maxPostViews: value.maxPostViews != null && value.maxPostViews < min ? min : value.maxPostViews });
              }} /></label>
              <span aria-hidden="true">—</span>
              <label>{tr("Maximum", "Maximum")}<input type="number" inputMode="numeric" min="0" step="100" aria-label={tr("Vues maximum", "Maximum views")} placeholder={tr("Illimité", "No limit")} value={value.maxPostViews ?? ""} onChange={(event) => {
                const max = event.target.value === "" ? null : Math.max(0, Number(event.target.value) || 0);
                onChange({ ...value, maxPostViews: max, minPostViews: max != null && value.minPostViews > max ? max : value.minPostViews });
              }} /></label>
            </div>
          </section>
          <section>
            <h2>{tr("Période de publication", "Publication dates")}</h2>
            <Histogram data={dates} date english={english} />
            <div className="ss-rs__periods" role="group" aria-label={tr("Périodes rapides", "Date presets")}>
              {[0, 7, 30, 90, 365].map((days) => <button key={days} type="button" aria-pressed={value.days === days && !value.dateFrom && !value.dateTo} onClick={() => onChange({ ...value, days, dateFrom: "", dateTo: "" })}>{days === 0 ? tr("Tout", "All") : days === 365 ? tr("1 an", "1 year") : `${days} ${tr("j", "d")}`}</button>)}
            </div>
            <div className="ss-rs__filter-inputs">
              <label>{tr("Du", "From")}<input type="date" aria-label={tr("Date de début", "Start date")} max={value.dateTo || inputDate(Date.now())} value={value.dateFrom} onChange={(event) => onChange({ ...value, days: 0, dateFrom: event.target.value, dateTo: value.dateTo && event.target.value > value.dateTo ? event.target.value : value.dateTo })} /></label>
              <span aria-hidden="true">—</span>
              <label>{tr("Au", "To")}<input type="date" aria-label={tr("Date de fin", "End date")} min={value.dateFrom || undefined} max={inputDate(Date.now())} value={value.dateTo} onChange={(event) => onChange({ ...value, days: 0, dateTo: event.target.value, dateFrom: value.dateFrom && event.target.value && event.target.value < value.dateFrom ? event.target.value : value.dateFrom })} /></label>
            </div>
          </section>
          <button type="button" className="ss-btn-purple lg-press ss-rs__filter-done" onClick={() => setOpen(false)}>{tr("Afficher les résultats", "Show results")}</button>
        </div>
      ) : null}
    </div>
  );
}

type Study = { id: string; status: string; slides: { index: number; text: string; status: string }[] };

/** Lecture du texte des slides d'un carrousel. Le moteur avance slide par
 *  slide : on relance tant qu'il reste du travail, et on s'arrete au demontage. */
function SlideText({ accountId, postId, tr }: { accountId: string; postId: string; tr: (fr: string, en: string) => string }) {
  const [study, setStudy] = useState<Study | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  // Le mode strict monte, demonte puis remonte : sans remettre le drapeau a vrai
  // au montage, la boucle de lecture ignorerait toutes les reponses en dev.
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  async function read() {
    setBusy(true);
    setError("");
    try {
      let next: Study = await api("/api/research/studies", { accountId, postId });
      if (alive.current) setStudy(next);
      while (alive.current && next.status === "pending") {
        next = await api(`/api/research/studies/${next.id}`, {});
        if (alive.current) setStudy(next);
      }
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : "study_failed");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  if (!study) {
    return (
      <div className="ss-rs__study">
        <button type="button" className="ss-btn-ghost lg-press" disabled={busy} onClick={() => void read()}>
          {busy ? <Orb size={20} state="searching" /> : null}
          {busy ? tr("Lecture…", "Reading…") : tr("Lire le texte des slides", "Read the slide text")}
        </button>
        {error ? <small>{tr("Lecture impossible pour ce carrousel.", "Cannot read this carousel.")}</small> : null}
      </div>
    );
  }

  const read_ = study.slides.filter((slide) => slide.text.trim());
  return (
    <div className="ss-rs__study">
      <strong>{tr("Texte des slides", "Slide text")}</strong>
      {read_.length ? (
        <ol>
          {read_.map((slide) => (
            <li key={slide.index}>
              <b>{slide.index}</b>
              <span>{slide.text}</span>
            </li>
          ))}
        </ol>
      ) : (
        <small>{study.status === "pending" ? tr("Lecture en cours…", "Reading…") : tr("Aucun texte lisible sur ces images.", "No readable text on these images.")}</small>
      )}
    </div>
  );
}

export function ResearchView() {
  const { user } = useStudio();
  if (!user) return <div className="ss-rs"><section className="ss-empty"><h2>Recherche</h2></section></div>;
  const cacheKey = `${user.id}:${user.projectId || "default"}`;
  return <ResearchWorkspace key={cacheKey} cacheKey={cacheKey} />;
}

function ResearchWorkspace({ cacheKey }: { cacheKey: string }) {
  // `posts` est la bibliotheque du projet : elle dit ce qui est deja garde.
  const { english, posts: library } = useStudio();
  const tr = useCallback((fr: string, en: string) => t(fr, en, english), [english]);

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<DisplayFilters>({ ...ALL_FILTERS });
  const { minPostViews, maxPostViews, days, dateFrom, dateTo } = filters;
  const [scope, setScope] = useState<"run" | "all">("all");
  const [items, setItems] = useState<Item[]>(() => cachedResearch(cacheKey)?.items || []);
  const [jobs, setJobs] = useState<Job[]>(() => cachedResearch(cacheKey)?.jobs || []);
  const [available, setAvailable] = useState(() => cachedResearch(cacheKey)?.available || false);
  const [loading, setLoading] = useState(() => !cachedResearch(cacheKey));
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [monitorKey, setMonitorKey] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<{ post: AccountVideo; handle: string; accountId: string; slide: number } | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  // Garder un carrousel : le bouton et le glissement partagent cet etat, pour
  // qu'une tuile deja gardee le dise quel que soit le geste employe.
  const [keeping, setKeeping] = useState<string | null>(null);
  const [kept, setKept] = useState<Record<string, true>>({});
  const keepingRef = useRef<string | null>(null);
  // Une tuile gardee quitte le mur, mais pas d'un coup : elle joue sa sortie
  // avant de disparaitre, sinon le clic donne l'impression d'avoir casse quelque chose.
  const [leaving, setLeaving] = useState<Record<string, true>>({});
  const [gone, setGone] = useState<Record<string, true>>({});

  const applyJobs = useCallback((incoming: Job[]) => {
    setJobs((current) => mergeResearchJobs(current, incoming.map((job) => ({ ...job, hasPostDetails: true }))));
  }, []);
  const applySummaries = useCallback((incoming: Job[]) => {
    setJobs((current) => mergeResearchJobs(current, incoming.map((job) => {
      const previous = current.find((existing) => existing.id === job.id);
      return {
        ...job,
        posts: job.hasPostDetails || job.posts?.length ? job.posts : previous?.posts || [],
        hasPostDetails: job.hasPostDetails || Boolean(job.posts?.length) || Boolean(previous?.hasPostDetails && previous.revision >= job.revision),
        results: job.results.map((result) => ({
          ...result,
          metrics: {
            ...result.metrics,
            topPosts: result.metrics.topPosts?.length ? result.metrics.topPosts : previous?.results.find((existing) => existing.accountId === result.accountId)?.metrics.topPosts || [],
          },
        })),
      };
    })));
  }, []);

  const libraryVersion = useRef(0);
  const loadLibrary = useCallback(async (signal?: AbortSignal, filters = { days: 0, minPostViews: 0 }) => {
    const version = ++libraryVersion.current;
    const result = await api(`/api/research?days=${filters.days}&minPostViews=${filters.minPostViews}`, undefined, signal);
    if (signal?.aborted || version !== libraryVersion.current) return;
    setItems(result.items);
    setAvailable(result.discoveryAvailable);
  }, []);

  useEffect(() => {
    if (!jobs.length && !items.length && !available) return;
    researchCache.set(cacheKey, { jobs, items, available, at: Date.now() });
    while (researchCache.size > 4) researchCache.delete(researchCache.keys().next().value!);
  }, [cacheKey, jobs, items, available]);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    let refreshedAt = 0;
    const refresh = () => {
      if (pending || controller.signal.aborted) return;
      pending = true;
      refreshedAt = Date.now();
      void api("/api/research/jobs", undefined, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        applySummaries(result.jobs);
        if (typeof result.discoveryAvailable === "boolean") setAvailable(result.discoveryAvailable);
        else void loadLibrary(controller.signal).catch(() => {});
        setLoadError("");
      }).catch((err) => {
        if (!controller.signal.aborted) setLoadError(err instanceof Error ? err.message : "load_failed");
      }).finally(() => {
        pending = false;
        if (!controller.signal.aborted) setLoading(false);
      });
    };
    const focus = () => { if (!document.hidden && Date.now() - refreshedAt > 15_000) refresh(); };
    refresh();
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    return () => { controller.abort(); window.removeEventListener("focus", focus); window.removeEventListener("online", focus); };
  }, [loadLibrary, applySummaries, monitorKey]);

  const run = scope === "run" ? jobs.find((job) => job.id === lastRun) || null : jobs.find((job) => LIVE.has(job.status)) || null;
  const activeId = run && LIVE.has(run.status) ? run.id : jobs.find((job) => LIVE.has(job.status))?.id || null;
  const runId = run?.id;
  const runMode = run?.input.mode;
  const measured = run?.progress.measured;
  const librarySelection = scope === "all" ? "all" : `${runId || ""}:${runMode || ""}:${measured || 0}`;

  // Reading the library never blocks startup or a history selection, and
  // filters only act on the cached result set; they never restart collection.
  useEffect(() => {
    if (scope !== "all" && (!runId || runMode === "posts")) return;
    const controller = new AbortController();
    void loadLibrary(controller.signal).catch((err) => {
      if (!controller.signal.aborted && !jobs.some((job) => job.posts.length)) setError(err instanceof Error ? err.message : "load_failed");
    });
    return () => controller.abort();
  }, [librarySelection, loadLibrary, monitorKey]);

  const detailLoaded = Boolean(run?.hasPostDetails);
  useEffect(() => {
    if (!runId || runId === activeId || detailLoaded) return;
    const controller = new AbortController();
    void api(`/api/research/jobs/${runId}`, undefined, controller.signal).then((job: Job) => {
      if (!controller.signal.aborted) applyJobs([{ ...job, hasPostDetails: true }]);
    }).catch((err) => {
      if (!controller.signal.aborted) setSyncError(err instanceof Error ? err.message : "load_failed");
    });
    return () => controller.abort();
  }, [runId, activeId, detailLoaded, applyJobs, monitorKey]);

  function selectHistory(job: Job | null) {
    setScope(job ? "run" : "all");
    setLastRun(job?.id || null);
    setQuery(job ? job.input.keywords.map((word) => job.input.kind === "analyze" ? `@${word.replace(/^@/, "")}` : word).join(", ") : "");
    setFilters({ ...ALL_FILTERS });
    setShown(PAGE);
    setSyncError("");
    setError("");
  }

  // Only the active job is polled. History is refreshed on entry or focus;
  // an idle page does not download the full research list in a loop.
  useEffect(() => {
    if (!activeId) return;
    const controller = new AbortController();
    let timer = 0;
    let lastAdvance = 0;
    let failures = 0;
    const poll = async () => {
      try {
        const job: Job = await api(`/api/research/jobs/${activeId}`, undefined, controller.signal);
        if (controller.signal.aborted) return;
        applyJobs([job]);
        if (!LIVE.has(job.status)) { setSyncError(""); return; }
        if (job.input.source === "provider" && (job.status === "queued" || Date.now() - lastAdvance > 15_000)) {
          lastAdvance = Date.now();
          const next: Job = await api(`/api/research/jobs/${activeId}`, { action: "advance" }, controller.signal);
          if (controller.signal.aborted) return;
          applyJobs([next]);
        }
        failures = 0;
        setSyncError("");
      } catch (err) {
        if (controller.signal.aborted) return;
        failures += 1;
        setSyncError(err instanceof Error ? err.message : "load_failed");
      }
      if (!controller.signal.aborted && failures < 3) timer = window.setTimeout(poll, 1000);
    };
    timer = window.setTimeout(poll, 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [activeId, applyJobs, monitorKey]);

  useEffect(() => {
    if (!activeId) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeId]);

  // Un carrousel deja garde n'a plus rien a faire dans la decouverte. La
  // reconstruction en editable suffixe l'identifiant : on le neutralise.
  const keptIds = useMemo(() => {
    const ids = new Set<string>();
    for (const post of library) {
      if (post.tiktokId) ids.add(post.tiktokId.replace(/-editable$/, ""));
    }
    return ids;
  }, [library]);

  const runHandles = useMemo(
    () => new Set((run?.results || []).map((result) => result.handle).concat((run?.pending || []).map((candidate) => candidate.handle))),
    [run],
  );
  const sourceRows = useMemo<Row[]>(() => {
    const direct = (scope === "all" ? jobs.flatMap((job) => job.posts || []) : run?.posts || []).map((row) => ({
      post: row.post,
      account: { id: row.accountId, handle: row.handle, avatar: row.avatar, nickname: row.nickname },
      metrics: null,
    }));
    if (scope === "run" && run?.input.mode === "posts") return direct;
    const keywords = new Set((run?.input.keywords || []).map((word) => word.toLowerCase()));
    const rows: Row[] = [];
    for (const item of items) {
      if (scope === "run" && (!run || !runHandles.has(item.account.handle))) continue;
      for (const post of item.account.videos || []) {
        if (scope === "run" && run?.input.kind === "discover"
          && !(post.matchedKeywords || []).some((keyword) => keywords.has(keyword.toLowerCase()))) continue;
        rows.push({ post, account: item.account, metrics: item.metrics });
      }
    }
    // Old account-analysis jobs may still have previews; they use the same
    // filtering and card actions as measured posts, without a separate counter.
    if (scope === "run") {
      for (const candidate of run?.pending || []) {
        for (const preview of candidate.posts) {
          rows.push({
            post: preview as AccountVideo,
            account: { id: "", handle: candidate.handle, avatar: candidate.avatar || undefined },
            metrics: null,
          });
        }
      }
    } else {
      rows.push(...direct);
    }
    return rows.sort((a, b) => b.post.views - a.post.views);
  }, [items, jobs, scope, run, runHandles]);

  const selection = useMemo(() => filterResearchPosts(sourceRows, {
    minPostViews, maxPostViews, days, ...researchDateBounds(dateFrom, dateTo), keptIds, leaving, gone,
  }), [sourceRows, minPostViews, maxPostViews, days, dateFrom, dateTo, keptIds, leaving, gone]);
  const wall = selection.posts;

  const histogramRows = useMemo(() => filterResearchPosts(sourceRows, { days: 0, minPostViews: 0, keptIds, leaving, gone }).posts, [sourceRows, keptIds, leaving, gone]);
  const activeFilters = minPostViews > 0 || maxPostViews != null || days > 0 || Boolean(dateFrom || dateTo);
  const accounts = new Set(wall.map((row) => row.account.handle)).size;
  const hunting = Boolean(run && LIVE.has(run.status));
  const stalled = hunting && Boolean(run) && now - Date.parse(run!.updatedAt) > 100_000;
  const disconnected = Boolean(syncError || loadError) || stalled;
  const found = run?.input.mode === "posts" ? run.progress.postsFound : selection.total;
  const elapsedSeconds = run ? Math.max(0, Math.floor(((hunting ? now : Date.parse(run.updatedAt)) - Date.parse(run.createdAt)) / 1000)) : 0;
  const elapsed = elapsedSeconds < 60 ? `${elapsedSeconds} s` : `${Math.floor(elapsedSeconds / 60)} min ${elapsedSeconds % 60} s`;
  const summary = loading ? tr("Chargement…", "Loading…")
    : wall.length ? `${wall.length} ${plural(wall.length, tr("carrousel", "carousel"), tr("carrousels", "carousels"))} · ${accounts} ${plural(accounts, tr("compte", "account"), tr("comptes", "accounts"))}`
    : hunting ? tr("Les carrousels apparaissent dès qu'ils sont trouvés", "Carousels appear as soon as they are found")
    : run && scope === "run" ? tr("Aucun carrousel affiché pour cette recherche", "No carousels displayed for this search")
    : tr("Les carrousels TikTok, directement par mot-clé", "TikTok carousels, directly by keyword");
  const hiddenFilters = selection.hidden.views + selection.hidden.unknownViews + selection.hidden.date + selection.hidden.unknownDate;
  const filterDetails = [
    selection.hidden.views ? tr(`${selection.hidden.views} hors plage de vues`, `${selection.hidden.views} outside the view range`) : "",
    selection.hidden.unknownViews ? tr(`${selection.hidden.unknownViews} aux vues inconnues`, `${selection.hidden.unknownViews} with unknown views`) : "",
    selection.hidden.date ? tr(`${selection.hidden.date} hors période`, `${selection.hidden.date} outside the date range`) : "",
    selection.hidden.unknownDate ? tr(`${selection.hidden.unknownDate} sans date connue`, `${selection.hidden.unknownDate} with unknown dates`) : "",
    selection.hidden.library ? tr(`${selection.hidden.library} déjà en bibliothèque`, `${selection.hidden.library} already in your library`) : "",
  ].filter(Boolean).join(" · ");

  const errorName = (code: string) =>
    ({
      research_provider_not_configured: tr("La collecte cloud n'est pas configurée.", "Cloud collection is not configured."),
      research_provider_daily_limit: tr("Quota de collecte atteint pour aujourd'hui.", "Daily collection quota reached."),
      daily_research_limit: tr("Limite de recherches atteinte pour aujourd'hui.", "Daily search limit reached."),
      active_research_limit: tr("Trois recherches tournent déjà. Arrête-en une.", "Three searches are already running. Stop one."),
      research_not_found: tr("Cette recherche n'existe plus.", "That search no longer exists."),
      research_stopped: tr("Cette recherche a été arrêtée.", "That search was stopped."),
      invalid_handle: tr("Ce @compte n'est pas valide.", "That @account is not valid."),
      research_cursor_stalled: tr("TikTok a interrompu la pagination. Relance.", "TikTok stopped paginating. Try again."),
      profile_posts_unavailable: tr("Les publications de ce compte sont illisibles.", "That account's posts are unreadable."),
      search_provider_rejected: tr("TikTok a refusé la recherche. Réessaie.", "TikTok refused the search. Try again."),
      search_time_limit: tr("Le délai de recherche a été atteint. Les résultats trouvés sont conservés.", "The search time limit was reached. Results found so far are kept."),
      search_version_changed: tr("Cette ancienne recherche doit être relancée avec le nouveau moteur.", "Restart this older search with the new search engine."),
      metrics_provider_timeout: tr("TikTok a mis trop de temps à répondre. Les résultats trouvés sont conservés.", "TikTok took too long to respond. Results found so far are kept."),
      metrics_provider_failed: tr("TikTok est temporairement indisponible. Réessaie dans un instant.", "TikTok is temporarily unavailable. Try again shortly."),
      metrics_provider_empty: tr("TikTok n'a pas renvoyé de résultats pour cette demande.", "TikTok returned no results for this request."),
      request_timeout: tr("La connexion a pris trop de temps. Les résultats trouvés sont conservés.", "The connection timed out. Results found so far are kept."),
      unauthorized: tr("Reconnecte-toi pour continuer la recherche.", "Sign in again to continue searching."),
      load_failed: tr("Chargement impossible.", "Could not load."),
      request_failed: tr("Requête impossible.", "Request failed."),
    })[code] || (["invalid_url", "not_found", "private_post", "no_images", "plan_required", "network", "import_failed"].includes(code)
      ? keepErrorLabel(code, english)
      : tr("La recherche n'a pas pu continuer. Réessaie ; les résultats trouvés sont conservés.", "The search could not continue. Try again; results found so far are kept."));

  const isHandle = query.trim().startsWith("@");

  async function start(event?: React.FormEvent, refresh = false) {
    event?.preventDefault();
    const input = refresh && run ? run.input.keywords.map((word) => run.input.kind === "analyze" ? `@${word}` : word).join(", ") : query;
    const words = input.split(/[,\n]/).map((w) => w.trim()).filter(Boolean);
    if (!words.length) return;
    setBusy(true);
    setError("");
    setSyncError("");
    try {
      const analyze = words.every((word) => word.startsWith("@"));
      const job = await api("/api/research/jobs", {
        kind: analyze ? "analyze" : "discover",
        mode: analyze ? "accounts" : "posts",
        source: "provider",
        keywords: words,
        target: 5,
        maxPages: 2,
        searchPages: 2,
        filters: {
          days: 0,
          minPostViews: 0,
          minPosts: analyze ? 5 : 1,
          minTotalViews: 0,
          minMedianViews: 0,
          minSlideshowShare: analyze ? 0.5 : 0,
          minFollowers: analyze ? 2000 : 0,
        },
        requestId: crypto.randomUUID(),
        refresh,
      });
      setLastRun(job.id);
      applyJobs([{ ...job, hasPostDetails: true }]);
      setScope("run");
      setShown(PAGE);
      setNow(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "research_failed");
    } finally {
      setBusy(false);
    }
  }

  const keep = useCallback(async ({ post, url }: { post: AccountVideo; url: string }) => {
    if (!url || keepingRef.current) return;
    keepingRef.current = post.id;
    setKeeping(post.id);
    setError("");
    const result = await keepInLibrary(url);
    keepingRef.current = null;
    setKeeping(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setKept((current) => ({ ...current, [post.id]: true }));
    setLeaving((current) => ({ ...current, [post.id]: true }));
    window.setTimeout(() => {
      setGone((current) => ({ ...current, [post.id]: true }));
      setLeaving((current) => {
        const next = { ...current };
        delete next[post.id];
        return next;
      });
    }, 420);
  }, []);

  // Le glissement reprend exactement le geste du calendrier : fantome sous le
  // pointeur, tuile d'origine estompee, cible flottante qui grossit.
  const keepDrag = useKeepDrag({ english, onKeep: keep });

  async function stop() {
    if (!activeId) return;
    setStopping(true);
    setError("");
    try {
      const job: Job = await api(`/api/research/jobs/${activeId}`, { action: "stop" });
      applyJobs([job]);
      setSyncError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "research_failed");
    } finally {
      setStopping(false);
    }
  }

  async function resume() {
    if (!run) return;
    setBusy(true);
    setError("");
    setSyncError("");
    try {
      const job: Job = await api(`/api/research/jobs/${run.id}`, { action: "resume" });
      applyJobs([job]);
      setLastRun(job.id);
      setScope("run");
      setMonitorKey((key) => key + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "research_failed");
    } finally {
      setBusy(false);
    }
  }

  const visible = wall.slice(0, shown);
  const terminalTitle = run?.status === "done" ? tr("Recherche terminée", "Search complete")
    : run?.status === "stopped" ? tr("Recherche arrêtée", "Search stopped")
    : run?.status === "paused" ? tr("Recherche en pause", "Search paused")
    : run?.status === "needs_attention" ? tr("Recherche à débloquer", "Search needs attention")
    : tr("Recherche interrompue", "Search interrupted");
  const completionDetail = run?.error ? errorName(run.error)
    : run?.completionReason === "page_limit" ? tr("Les pages prévues ont été lues. D'autres résultats peuvent exister sur TikTok.", "The planned pages have been read. More results may exist on TikTok.")
    : run?.completionReason === "pagination_stalled" ? tr("TikTok n'a pas fourni de nouvelle page. Les résultats trouvés sont conservés.", "TikTok did not provide a new page. Results found so far are kept.")
    : run?.completionReason === "result_limit" ? tr("La limite de résultats de cette recherche est atteinte.", "This search reached its result limit.")
    : run?.status === "stopped" ? tr("Les résultats trouvés restent consultables.", "Results found so far remain available.")
    : "";

  return (
    <div className="ss-rs ss-page-enter">
      <div className="ss-rs__bar">
        <div className="ss-rs__title">
          <h1>{tr("Recherche", "Research")}</h1>
          <p className="ss-rs__summary" key={summary}>{summary}</p>
        </div>

        <div className="ss-rs__tools">
        <form className="ss-rs__field lg lg--lens" onSubmit={(event) => void start(event)} role="search">
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M13.5 13.5 17 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            list="ss-rs-recent"
            autoComplete="off"
            spellCheck={false}
            placeholder={tr("routine sommeil, astuces révision…", "sleep routine, study tips…")}
            aria-label={tr("Mots-clés ou @compte", "Keywords or @account")}
          />
          <datalist id="ss-rs-recent">
            {[...new Set(jobs.map((job) => job.input.keywords.join(", ")))].slice(0, 8).map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          <Metal preset="silver" strength={busy ? 1 : 0.7}>
            <button type="submit" className="ss-btn-purple lg-press" disabled={!query.trim() || busy || !available}>
              {busy ? <Orb size={20} state="searching" invert /> : null}
              {busy ? tr("Départ…", "Starting…") : isHandle ? tr("Analyser", "Analyze") : tr("Chercher", "Search")}
            </button>
          </Metal>
        </form>
        <ResearchFilters rows={histogramRows} value={filters} onChange={(next) => { setFilters(next); setShown(PAGE); }} english={english} />
        </div>

        <nav className="ss-rs__history" role="tablist" aria-label={tr("Historique des recherches", "Search history")} onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
          const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
          const index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
          event.preventDefault(); tabs[index]?.focus(); tabs[index]?.click();
        }}>
          <button type="button" role="tab" aria-selected={scope === "all"} aria-controls="ss-rs-results" tabIndex={scope === "all" ? 0 : -1} className={scope === "all" ? "is-on lg lg--lens" : "lg-press"} onClick={() => selectHistory(null)}>{tr("Tout", "All")}</button>
          {jobs.map((job) => {
            const selected = scope === "run" && lastRun === job.id;
            const status = LIVE.has(job.status) ? tr("En cours", "Running") : job.status === "done" ? tr("Terminée", "Complete") : job.status === "stopped" ? tr("Arrêtée", "Stopped") : tr("Interrompue", "Interrupted");
            const label = job.input.keywords.map((word) => job.input.kind === "analyze" ? `@${word.replace(/^@/, "")}` : word).join(", ");
            return <button key={job.id} type="button" role="tab" aria-selected={selected} aria-controls="ss-rs-results" tabIndex={selected ? 0 : -1} className={selected ? "is-on lg lg--lens" : "lg-press"} title={`${label} · ${status} · ${new Date(job.createdAt).toLocaleString(english ? "en-GB" : "fr-FR")}`} onClick={() => selectHistory(job)}>
              <span className={`ss-rs__history-dot${LIVE.has(job.status) ? " is-live" : job.status === "done" ? " is-done" : ""}`} aria-label={status} />
              <span className="ss-rs__history-label">{label}</span>
              {job.input.mode === "posts" ? <small>{job.progress.postsFound}</small> : null}
            </button>;
          })}
        </nav>

        {run && hunting && !disconnected ? (
          <div className="ss-rs__hunt">
            <TikTokScanLine
              kind={run.current.kind}
              target={run.current.label}
              done={run.current.kind === "search" ? run.progress.pagesDone : run.progress.measured}
              total={run.current.kind === "search" ? run.progress.pagesTotal : Math.max(1, run.progress.candidates)}
              fr={run.current.kind === "search"
                ? `Recherche « ${run.current.label || run.input.keywords.join(", ")} » · ${run.progress.pagesDone} / ${run.progress.pagesTotal} pages lues`
                : `Lecture de @${run.current.label || run.input.keywords[0]} · ${run.progress.measured} / ${run.progress.candidates} comptes`}
              en={run.current.kind === "search"
                ? `Searching “${run.current.label || run.input.keywords.join(", ")}” · ${run.progress.pagesDone} / ${run.progress.pagesTotal} pages read`
                : `Reading @${run.current.label || run.input.keywords[0]} · ${run.progress.measured} / ${run.progress.candidates} accounts`}
              english={english}
            >
              <span className="ss-rs__count">{found} {plural(found, tr("carrousel trouvé", "carousel found"), tr("carrousels trouvés", "carousels found"))} · {elapsed}</span>
              <button type="button" className="ss-btn-ghost ss-btn-icon lg-press" disabled={stopping} onClick={() => void stop()}>
                {stopping ? tr("Arrêt…", "Stopping…") : tr("Arrêter", "Stop")}
              </button>
            </TikTokScanLine>
          </div>
        ) : run && !hunting ? (
          <div className={`ss-rs__status${run.status === "done" ? " is-complete" : ""}`} role="status">
            <div>
              <strong>{run.status === "done" ? <IconCheck size={16} /> : null}{terminalTitle}</strong>
              <span>{found} {plural(found, tr("carrousel trouvé", "carousel found"), tr("carrousels trouvés", "carousels found"))} · {elapsed}</span>
              {run.status === "done" || completionDetail ? <p>{run.status === "done" ? <>{tr("Résultats du", "Results from")} {new Date(run.updatedAt).toLocaleString(english ? "en-GB" : "fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. </> : null}{completionDetail}</p> : null}
            </div>
            {run.status === "done" ? <button type="button" className="ss-btn-ghost lg-press" disabled={busy || !available} onClick={() => void start(undefined, true)}>{tr("Actualiser", "Refresh")}</button> : null}
            {run.status === "paused" ? (
              <button type="button" className="ss-btn-ghost lg-press" disabled={busy} onClick={() => void resume()}>{run.error === "search_version_changed" ? tr("Relancer", "Restart") : tr("Reprendre", "Resume")}</button>
            ) : null}
          </div>
        ) : null}

        {disconnected ? (
          <div className="ss-rs__status is-warning" role="alert">
            <div>
              <strong>{tr("Le suivi de la recherche est interrompu", "Search updates interrupted")}</strong>
              <p>{syncError || loadError ? errorName(syncError || loadError) : tr("La recherche ne répond plus. Les résultats trouvés restent disponibles.", "The search is not responding. Results found so far remain available.")}</p>
            </div>
            <button type="button" className="ss-btn-ghost lg-press" onClick={() => { setSyncError(""); setMonitorKey((key) => key + 1); }}>{tr("Réessayer", "Retry")}</button>
            {hunting ? <button type="button" className="ss-btn-ghost lg-press" disabled={stopping} onClick={() => void stop()}>{tr("Arrêter", "Stop")}</button> : null}
          </div>
        ) : null}

        {filterDetails ? (
          <p className="ss-rs__filters-note">
            {filterDetails}
            {hiddenFilters > 0 && activeFilters ? <button type="button" onClick={() => { setFilters({ ...ALL_FILTERS }); setShown(PAGE); }}>{tr("Effacer les filtres", "Clear filters")}</button> : null}
          </p>
        ) : null}

        {error ? <p className="ss-rs__err" role="alert">{errorName(error)}</p> : null}
        {run && run.input.source === "browser" && LIVE.has(run.status) ? (
          <p className="ss-rs__jobid">npm run research:browser -- --job {run.id}</p>
        ) : null}
      </div>

      {visible.length ? (
        <>
          <ul className="ss-rs__wall" id="ss-rs-results" role="tabpanel" aria-label={scope === "run" ? query : tr("Toutes les recherches", "All searches")}>
            {visible.map((row, i) => {
              const lift = liftOf(row.post, row.metrics);
              return (
                <li
                  key={`${row.account.handle}:${row.post.id}`}
                  className={[keepDrag.draggedId === row.post.id ? "is-lifted" : "", leaving[row.post.id] ? "is-kept" : ""].filter(Boolean).join(" ") || undefined}
                  style={{ "--i": Math.min(i, 11) } as CSSProperties}
                  {...keepDrag.handlers({ post: row.post, handle: row.account.handle, url: row.post.url })}
                >
                  <PostTile
                    post={row.post}
                    en={english}
                    author={{ handle: row.account.handle, avatar: row.account.avatar }}
                    badge={lift ? `×${lift.toFixed(1)}` : null}
                    onOpen={(slide) => setOpen({ post: row.post, handle: row.account.handle, accountId: row.account.id, slide })}
                    footer={
                      <button
                        type="button"
                        className="ss-rs__keep"
                        disabled={keeping === row.post.id || kept[row.post.id]}
                        onClick={() => void keep({ post: row.post, url: row.post.url })}
                      >
                        {kept[row.post.id]
                          ? tr("Dans la bibliothèque", "In the library")
                          : keeping === row.post.id
                            ? tr("Ajout…", "Adding…")
                            : tr("+ Bibliothèque", "+ Library")}
                      </button>
                    }
                  />
                </li>
              );
            })}
          </ul>
          {wall.length > shown ? (
            <button type="button" className="ss-btn-ghost lg-press ss-rs__more-btn" onClick={() => setShown((n) => n + PAGE)}>
              {tr(`Voir ${Math.min(PAGE, wall.length - shown)} de plus`, `Show ${Math.min(PAGE, wall.length - shown)} more`)}
            </button>
          ) : null}
        </>
      ) : (
        <section className="ss-empty" id="ss-rs-results" role="tabpanel">
          <h2>{loading ? tr("Chargement…", "Loading…")
            : run && !detailLoaded ? tr("Chargement des résultats…", "Loading results…")
            : disconnected ? tr("Suivi de la recherche interrompu", "Search updates interrupted")
            : hunting ? tr("Recherche des premiers carrousels…", "Finding the first carousels…")
            : hiddenFilters > 0 ? tr("Aucun carrousel avec ces filtres", "No carousels match these filters")
            : selection.hidden.library > 0 ? tr("Ces carrousels sont déjà en bibliothèque", "These carousels are already in your library")
            : run && scope === "run" ? tr("Aucun carrousel trouvé", "No carousels found")
            : tr("Trouve des carrousels qui marchent", "Find carousels that work")}</h2>
          <p>{disconnected ? tr("Réessaie pour retrouver le suivi de la recherche.", "Retry to reconnect to the search.")
            : !available && !loading ? tr("La collecte cloud n'est pas configurée.", "Cloud collection is not configured.")
            : hunting ? tr("Tu peux consulter les résultats dès leur arrivée.", "You can browse results as they arrive.")
            : hiddenFilters > 0 ? tr("Élargis les vues ou les dates pour afficher les résultats trouvés.", "Broaden the view or date filters to see the results found.")
            : run && scope === "run" ? tr("Essaie un autre mot-clé ou une autre orthographe.", "Try another keyword or spelling.")
            : tr("Tape une niche, ou un @compte à analyser.", "Type a niche, or an @account to analyze.")}</p>
        </section>
      )}

      {keepDrag.overlay}

      {open ? (
        <PostViewer
          video={open.post}
          handle={open.handle}
          initialSlide={open.slide}
          en={english}
          onClose={() => setOpen(null)}
          extra={open.accountId && open.post.images?.length ? <SlideText accountId={open.accountId} postId={open.post.id} tr={tr} /> : null}
        />
      ) : null}
    </div>
  );
}
