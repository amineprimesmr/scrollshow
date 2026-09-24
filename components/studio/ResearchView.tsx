"use client";

import type { Account, AccountVideo } from "@/lib/types";
import type { publicJob } from "@/lib/research/jobs";
import type { researchMetrics } from "@/lib/research/statistics";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { t } from "@/lib/i18n";
import { useStudio } from "./StudioContext";
import { PostTile } from "./PostTile";
import { signedUrlExpired } from "./cover";
import { PostViewer } from "./PostViewer";
import { TikTokScanLine } from "./TikTokScan";
import { IconCheck } from "./icons";
import { keepErrorLabel, keepInLibrary } from "./library-drop";
import { useKeepDrag } from "./useKeepDrag";
import { filterResearchPosts, mergeResearchJobs, type ResearchPostRow } from "./research-state";
import { Metal } from "@/components/fx/Metal";
import { Orb } from "@/components/fx/Orb";
import "./research.css";

type Metrics = ReturnType<typeof researchMetrics>;
type Item = { account: Account; metrics: Metrics; measuredAt: string | null };
type Job = ReturnType<typeof publicJob> & { hasPostDetails?: boolean; reused?: boolean; cachedAt?: string };
type Row = ResearchPostRow & { metrics: Metrics | null };

const LIVE = new Set(["queued", "running"]);
const PAGE = 24;
type WallOrder = "views" | "likes" | "comments" | "shares" | "recent";
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
  // Plus de filtres d'affichage (retires a la demande d'Amine) : le mur montre
  // tout ce que la recherche a trouve. Le tri n'apparait qu'une fois la
  // recherche terminee — trier un mur qui se remplit ferait sauter les tuiles.
  const [order, setOrder] = useState<WallOrder>("views");
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
    setOrder("views");
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
      // Onglet masque : personne ne regarde, et a mille studios ouverts ce
      // sondage est la premiere charge du serveur. On reprend au retour.
      if (document.hidden) { timer = window.setTimeout(poll, 4000); return; }
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
      if (!controller.signal.aborted && failures < 3) timer = window.setTimeout(poll, 2500);
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

  const selection = useMemo(() => filterResearchPosts(sourceRows, { days: 0, minPostViews: 0, keptIds, leaving, gone }), [sourceRows, keptIds, leaving, gone]);

  const hunting = Boolean(run && LIVE.has(run.status));
  const sortable = !hunting && selection.posts.length > 1;
  const wall = useMemo(() => {
    if (hunting || order === "views") return selection.posts;
    const rank = (row: ResearchPostRow) => order === "recent" ? row.post.createdAt || 0 : Number(row.post[order]) || 0;
    return [...selection.posts].sort((a, b) => rank(b) - rank(a));
  }, [selection.posts, order, hunting]);
  const stalled = hunting && Boolean(run) && now - Date.parse(run!.updatedAt) > 100_000;
  const disconnected = Boolean(syncError || loadError) || stalled;
  const found = run?.input.mode === "posts" ? run.progress.postsFound : selection.total;
  const elapsedSeconds = run ? Math.max(0, Math.floor(((hunting ? now : Date.parse(run.updatedAt)) - Date.parse(run.createdAt)) / 1000)) : 0;
  const elapsed = elapsedSeconds < 60 ? `${elapsedSeconds} s` : `${Math.floor(elapsedSeconds / 60)} min ${elapsedSeconds % 60} s`;
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
      search_keyword_refused: tr("TikTok n'a pas répondu pour ce mot-clé. Réessaie dans un moment ou essaie une autre orthographe.", "TikTok did not answer for this keyword. Try again in a moment or try another spelling."),
      tiktok_requires_attention: tr("TikTok demande une connexion ou une vérification. Connecte-toi à tiktok.com dans ce navigateur, puis relance la recherche.", "TikTok asks for a login or a verification. Sign in to tiktok.com in this browser, then run the search again."),
      tiktok_login_needed: tr("Tu n'es pas connecté à TikTok dans ce navigateur : TikTok n'a donné que la première page. Connecte-toi à tiktok.com puis clique sur Actualiser.", "You are not signed in to TikTok in this browser: TikTok only gave the first page. Sign in to tiktok.com, then click Refresh."),
      extension_unreachable: tr("L'extension ScrollShow ne répond pas. Recharge la page, ou réinstalle l'extension.", "The ScrollShow extension is not responding. Reload the page, or reinstall the extension."),
      search_provider_rejected: tr("TikTok a refusé la recherche. Réessaie.", "TikTok refused the search. Try again."),
      search_time_limit: tr("Le délai de recherche a été atteint. Les résultats trouvés sont conservés.", "The search time limit was reached. Results found so far are kept."),
      search_version_changed: tr("Cette ancienne recherche doit être relancée avec le nouveau moteur.", "Restart this older search with the new search engine."),
      metrics_provider_timeout: tr("TikTok a mis trop de temps à répondre. Les résultats trouvés sont conservés.", "TikTok took too long to respond. Results found so far are kept."),
      metrics_user_daily_limit: tr("Limite quotidienne de collecte atteinte. Elle se réinitialise demain ; les résultats trouvés sont conservés.", "Daily collection limit reached. It resets tomorrow; results found so far are kept."),
      metrics_provider_blocked: tr("La collecte TikTok est suspendue côté ScrollShow. Les résultats trouvés sont conservés ; réessaie plus tard.", "TikTok collection is paused on ScrollShow's side. Results found so far are kept; try again later."),
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

  // Extension Chrome ScrollShow : quand elle est installee, une recherche par
  // mots-cles tourne dans le TikTok CONNECTE de l'utilisateur (volume reel, aucun
  // appel paye). Sans elle on garde la collecte serveur, plus pauvre sur certains
  // mots-cles. La page ne connait pas l'identifiant de l'extension : tout passe
  // par window.postMessage, relaye par son script de contenu.
  const [extension, setExtension] = useState<string | null>(null);
  const [live, setLive] = useState<{ jobId: string; pages: number; posts: number } | null>(null);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.data?.source !== "scrollshow-ext") return;
      const message = event.data as { type: string; version?: string; jobId?: string; pages?: number; posts?: number; error?: string; blocked?: string };
      if (message.type === "ready") setExtension(message.version || "1");
      if (message.type === "progress" && message.jobId) setLive({ jobId: message.jobId, pages: message.pages || 0, posts: message.posts || 0 });
      if ((message.type === "finished" || message.type === "error") && message.jobId) {
        setLive(null);
        if (message.type === "error") setSyncError(message.error || "collector_failed");
        // Non connecte a TikTok : TikTok ne sert que la premiere page. On garde
        // ce qui a ete lu et on dit quoi faire pour avoir le reste.
        else if (message.blocked === "login") setError("tiktok_login_needed");
        else if (message.blocked === "captcha") setError("tiktok_requires_attention");
        void api(`/api/research/jobs/${message.jobId}`).then((job: Job) => applyJobs([{ ...job, hasPostDetails: true }])).catch(() => {});
      }
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ source: "scrollshow-web", type: "ping" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, [applyJobs]);
  const liveRun = live && run && live.jobId === run.id ? live : null;
  const collectInBrowser = (jobId: string) => window.postMessage({ source: "scrollshow-web", type: "collect", jobId }, window.location.origin);

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
        source: extension && !analyze ? "browser" : "provider",
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
      if (job.input?.source === "browser" && ["queued", "running"].includes(job.status)) collectInBrowser(job.id);
      setScope("run");
      setShown(PAGE);
      setNow(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "research_failed");
    } finally {
      setBusy(false);
    }
  }

  // Les liens d'images TikTok sont signes et meurent en un a deux jours : une
  // recherche rouverte depuis l'historique n'affichait que des tuiles
  // « indisponible ». On la relance une fois, en contournant le cache.
  const revived = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!run || run.status !== "done" || busy || !available || revived.current.has(run.id)) return;
    const sample = wall.slice(0, 12);
    const dead = sample.filter((row) => signedUrlExpired(row.post.images?.[0] || row.post.cover)).length;
    if (!sample.length || dead * 2 < sample.length) return;
    revived.current.add(run.id);
    void start(undefined, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id, run?.status, wall, busy, available]);

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
      if (job.input?.source === "browser" && ["queued", "running"].includes(job.status)) collectInBrowser(job.id);
      setLastRun(job.id);
      setScope("run");
      setMonitorKey((key) => key + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "research_failed");
    } finally {
      setBusy(false);
    }
  }

  // Reference stable : c'est elle qui permet au mur memoise de ne pas se re-rendre.
  const visible = useMemo(() => wall.slice(0, shown), [wall, shown]);
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

  // Le mur ne depend pas de l'horloge : sans ce memo il etait re-rendu en entier
  // chaque seconde (chrono de la recherche) et a chaque pixel d'un glisser.
  const draggedId = keepDrag.draggedId;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const wallList = useMemo(() => (
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
  ), [visible, english, draggedId, leaving, keeping, kept, scope, query]);

  return (
    <div className="ss-rs ss-page-enter">
      <div className="ss-rs__bar">
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

        {!extension && !hunting ? (
          <p className="ss-rs__ext">
            {tr("Résultats limités sur certains mots-clés.", "Results are limited on some keywords.")}{" "}
            <a href="/extension" target="_blank" rel="noreferrer">{tr("Installe l'extension ScrollShow", "Install the ScrollShow extension")}</a>{" "}
            {tr("pour chercher directement dans ton TikTok, sans limite.", "to search straight inside your TikTok, without limits.")}
          </p>
        ) : null}

        {run && hunting && !disconnected ? (
          <div className="ss-rs__hunt">
            <TikTokScanLine
              kind={run.current.kind}
              target={run.current.label}
              done={run.current.kind === "search" ? run.progress.pagesDone : run.progress.measured}
              total={run.current.kind === "search" ? run.progress.pagesTotal : Math.max(1, run.progress.candidates)}
              fr={liveRun
                ? `Lecture dans ton TikTok · « ${run.input.keywords.join(", ")} » · ${liveRun.pages} ${liveRun.pages > 1 ? "pages" : "page"} · ${liveRun.posts} carrousels lus`
                : run.current.kind === "search"
                ? `Recherche « ${run.current.label || run.input.keywords.join(", ")} » · ${run.progress.pagesDone} / ${run.progress.pagesTotal} pages lues`
                : `Lecture de @${run.current.label || run.input.keywords[0]} · ${run.progress.measured} / ${run.progress.candidates} comptes`}
              en={liveRun
                ? `Reading in your TikTok · “${run.input.keywords.join(", ")}” · ${liveRun.pages} ${liveRun.pages > 1 ? "pages" : "page"} · ${liveRun.posts} carousels read`
                : run.current.kind === "search"
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

        {sortable ? (
          <div className="ss-rs__sort lg" role="group" aria-label={tr("Trier par", "Sort by")}>
            {(["views", "likes", "comments", "shares", "recent"] as const).map((id) => (
              <button key={id} type="button" aria-pressed={order === id} className={order === id ? "is-on" : ""} onClick={() => { setOrder(id); setShown(PAGE); }}>
                {id === "views" ? tr("Vues", "Views") : id === "likes" ? "Likes" : id === "comments" ? tr("Commentaires", "Comments") : id === "shares" ? tr("Partages", "Shares") : tr("Récents", "Recent")}
              </button>
            ))}
          </div>
        ) : null}

        {filterDetails ? (
          <p className="ss-rs__filters-note">
            {filterDetails}
          </p>
        ) : null}

        {error ? <p className="ss-rs__err" role="alert">{errorName(error)}</p> : null}
        {run && run.input.source === "browser" && LIVE.has(run.status) ? (
          <p className="ss-rs__jobid">npm run research:browser -- --job {run.id}</p>
        ) : null}
      </div>

      {visible.length ? (
        <>
          {wallList}
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
