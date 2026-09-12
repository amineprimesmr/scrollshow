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
import { IconCheck, IconChevron } from "./icons";
import { coverSrc } from "./cover";
import { keepErrorLabel, keepInLibrary } from "./library-drop";
import { useKeepDrag } from "./useKeepDrag";
import { Metal } from "@/components/fx/Metal";
import { Orb } from "@/components/fx/Orb";
import "./research.css";

type Metrics = ReturnType<typeof researchMetrics>;
type Item = { account: Account; metrics: Metrics; measuredAt: string | null };
type Job = ReturnType<typeof publicJob>;
type Row = { post: AccountVideo; account: Account; metrics: Metrics | null };

const LIVE = new Set(["queued", "running"]);
const PAGE = 24;
/** Au plus 4 posts par compte avant de passer au suivant : un seul compte
 *  prolifique ne doit pas remplir tout l'ecran. */
const PER_ACCOUNT = 4;

const VIEW_STEPS = [0, 1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 500_000, 1_000_000];
const DAY_STEPS = [7, 30, 90, 365];

async function api(url: string, body?: unknown) {
  const res = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "request_failed");
  return json;
}

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

function compactNum(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`;
  return String(Math.round(n));
}

/** Un post merite d'etre signale quand il depasse deux fois ce que son compte
 *  fait d'habitude. Garde reprise du moteur : sans mediane connue et sans
 *  echantillon suffisant, le multiple serait un mensonge chiffre. */
function liftOf(post: AccountVideo, metrics: Metrics | null) {
  if (!metrics?.medianViews || metrics.medianViews <= 0 || metrics.measuredSlideshowPosts < 5) return null;
  const lift = post.views / metrics.medianViews;
  return lift >= 2 ? lift : null;
}

function Pill({
  label,
  options,
  value,
  onChange,
  disabled,
  title,
}: {
  label: string;
  options: { value: number; label: string }[];
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((option) => option.value === value);
  return (
    <div className="ss-rs__dial" ref={box}>
      <button
        type="button"
        className="ss-rs__pill lg lg--lens lg-press"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        title={title}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        {current?.label ?? label}
        <IconChevron size={12} dir="down" />
      </button>
      {open ? (
        <div className="ss-rs__menu lg" role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
              {option.value === value ? <IconCheck size={14} /> : null}
            </button>
          ))}
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
  // `posts` est la bibliotheque du projet : elle dit ce qui est deja garde.
  const { english, posts: library } = useStudio();
  const tr = useCallback((fr: string, en: string) => t(fr, en, english), [english]);

  const [query, setQuery] = useState("");
  // 100k combine a 30 jours ne laissait presque rien passer : la page finissait
  // vide alors que TikTok regorge de carrousels sur le sujet.
  const [minPostViews, setMinPostViews] = useState(10_000);
  const [days, setDays] = useState(30);
  const [scope, setScope] = useState<"run" | "all">("all");

  const [items, setItems] = useState<Item[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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

  const load = useCallback(async () => {
    try {
      const [library, runs] = await Promise.all([
        api(`/api/research?days=${days}&minPostViews=${minPostViews}`),
        api("/api/research/jobs"),
      ]);
      setItems(library.items);
      setAvailable(library.discoveryAvailable);
      setJobs(runs.jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, [days, minPostViews]);

  useEffect(() => {
    void load();
  }, [load]);

  const running = useMemo(() => jobs.filter((job) => LIVE.has(job.status)), [jobs]);
  // Apres un rechargement, la derniere recherche reste la reference : sans elle
  // le segment de portee disparait et les resultats se noient dans la bibliotheque.
  const run = running[0] || jobs.find((job) => job.id === lastRun) || jobs[0] || null;
  const activeId = running[0]?.id || null;

  // Une recherche en cours : on relit vite, les comptes arrivent au fil de l'eau.
  // Au repos : lentement, pour qu'une recherche lancee par un agent finisse par
  // apparaitre ici sans rechargement.
  useEffect(() => {
    if (activeId) return;
    const idle = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(idle);
  }, [activeId, load]);

  const pumping = useRef(false);
  useEffect(() => {
    if (!activeId) return;
    let live = true;
    const poll = window.setInterval(() => { if (live) void load(); }, 2500);
    const pump = window.setInterval(async () => {
      if (pumping.current) return;
      pumping.current = true;
      try {
        await api(`/api/research/jobs/${activeId}`, { action: "advance" });
      } catch {
        // Bail encore actif ou reseau : le tour suivant reessaie.
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
    () => new Set((run?.results || []).map((r) => r.handle).concat((run?.pending || []).map((c) => c.handle))),
    [run],
  );
  /** Les mots-cles de la recherche affichee. « sleepmaxing » doit rendre des
   *  carrousels sleepmaxing, pas le meilleur post du compte ou on les a trouves. */
  const runKeywords = useMemo(
    () => new Set((run?.input?.keywords || []).map((k) => k.toLowerCase())),
    [run],
  );
  /** Les comptes mesures avant que les carrousels soient marques n'ont aucune
   *  trace de mot-cle : leur appliquer le filtre viderait le mur au lieu de
   *  l'affiner. On ne s'y limite que s'il existe au moins une correspondance. */
  const hasKeywordMatches = useMemo(
    () =>
      runKeywords.size > 0 &&
      items.some((item) =>
        (item.account.videos || []).some((video) =>
          (video.matchedKeywords || []).some((k) => runKeywords.has(k.toLowerCase())),
        ),
      ),
    [items, runKeywords],
  );

  /** Le mur : les carrousels qui franchissent le plancher, les plus vus d'abord,
   *  entrelaces pour qu'aucun compte ne monopolise l'ecran. */
  const wall = useMemo(() => {
    const floor = Date.now() - days * 86400000;
    const byAccount = new Map<string, Row[]>();
    for (const item of items) {
      if (scope === "run" && runHandles.size && !runHandles.has(item.account.handle)) continue;
      const rows: Row[] = [];
      for (const post of item.account.videos || []) {
        if (post.kind !== "photo") continue;
        // Sur une recherche, on ne garde que ce que le mot-cle a ramene. Sans
        // ca, un compte trouve pour « sleepmaxing » impose son carrousel le plus
        // vu, meme s'il parle d'autre chose.
        if (scope === "run" && hasKeywordMatches
          && !(post.matchedKeywords || []).some((k) => runKeywords.has(k.toLowerCase()))) continue;
        if (minPostViews > 0 && (post.missingMetrics?.includes("views") || post.views < minPostViews)) continue;
        if (post.createdAt > 0 && post.createdAt * 1000 < floor) continue;
        // Deja garde : on le retire, sauf le temps de sa sortie.
        if (gone[post.id]) continue;
        if (keptIds.has(post.id) && !leaving[post.id]) continue;
        rows.push({ post, account: item.account, metrics: item.metrics });
      }
      if (rows.length) byAccount.set(item.account.handle, rows.sort((a, b) => b.post.views - a.post.views));
    }
    const groups = [...byAccount.values()].sort((a, b) => b[0].post.views - a[0].post.views);
    const out: Row[] = [];
    for (let round = 0; round < PER_ACCOUNT; round += 1) {
      for (const group of groups) if (group[round]) out.push(group[round]);
    }
    return out;
  }, [items, scope, minPostViews, days, runHandles, runKeywords, hasKeywordMatches]);

  const waiting = useMemo(() => {
    if (!run || !LIVE.has(run.status)) return [];
    const measured = new Set(wall.map((row) => row.account.handle));
    const floor = Date.now() - days * 86400000;
    // Meme plancher et meme fenetre que le mur. Une carte qui ne les passe pas
    // s'affichait pendant la recherche puis disparaissait a la mesure : c'est ce
    // clignotement, et ces vues bien en dessous du filtre, que l'on supprime.
    return (run.pending || [])
      .filter((c) => !measured.has(c.handle))
      .map((c) => ({
        ...c,
        posts: (c.posts || []).filter(
          (p) =>
            p.kind === "photo" &&
            !(minPostViews > 0 && (p.missingMetrics?.includes("views") || p.views < minPostViews)) &&
            !(p.createdAt > 0 && p.createdAt * 1000 < floor),
        ),
      }))
      .filter((c) => c.posts.length > 0);
  }, [run, wall, minPostViews, days]);

  // Un seuil rond s'ecrit rond : « 1M+ », jamais « 1.0M+ ».
  const viewLabel = useCallback(
    (n: number) => (n === 0 ? tr("Toutes les vues", "All views") : `${n >= 1e6 ? `${n / 1e6}M` : `${n / 1e3}k`}+`),
    [tr],
  );
  const dayLabel = useCallback((n: number) => (n === 365 ? tr("12 mois", "12 months") : tr(`${n} jours`, `${n} days`)), [tr]);

  const accounts = new Set(wall.map((r) => r.account.handle)).size;
  const hunting = Boolean(run && LIVE.has(run.status));
  const summary = loading
    ? tr("Chargement…", "Loading…")
    : hunting && !wall.length
      ? tr("On fouille TikTok…", "Digging through TikTok…")
      : wall.length
      ? `${wall.length} ${plural(wall.length, tr("carrousel", "carousel"), tr("carrousels", "carousels"))} · ${accounts} ${plural(accounts, tr("compte", "account"), tr("comptes", "accounts"))} · ${viewLabel(minPostViews)} · ${dayLabel(days)}`
      : keptIds.size && items.length
        ? tr("Tout est déjà dans ta bibliothèque", "Everything is already in your library")
        : items.length
        ? tr(`Aucun carrousel au-dessus de ${viewLabel(minPostViews)} sur ${dayLabel(days)}`, `No carousel above ${viewLabel(minPostViews)} over the ${dayLabel(days)}`)
        : tr("Lance une recherche pour trouver des carrousels qui marchent", "Run a search to find carousels that work");

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
      load_failed: tr("Chargement impossible.", "Could not load."),
      request_failed: tr("Requête impossible.", "Request failed."),
    })[code] || keepErrorLabel(code, english);

  const isHandle = query.trim().startsWith("@");

  async function start(event: React.FormEvent) {
    event.preventDefault();
    const words = query.split(/[,\n]/).map((w) => w.trim()).filter(Boolean);
    if (!words.length) return;
    setBusy(true);
    setError("");
    try {
      const job = await api("/api/research/jobs", {
        kind: words.every((w) => w.startsWith("@")) ? "analyze" : "discover",
        source: "provider",
        keywords: words,
        target: 5,
        maxPages: 2,
        searchPages: 2,
        filters: {
          days,
          minPostViews,
          // Avec un plancher, minPosts veut dire « combien de carrousels doivent
          // le franchir ». Cinq a 100k serait une porte bien trop etroite ; deux
          // suffisent a ecarter le coup de chance.
          minPosts: minPostViews > 0 ? 2 : 5,
          // Ce seuil vaut 100000 par defaut : sans ce zero explicite, un plancher
          // cumule invisible rejetterait des comptes derriere le dos de l'utilisateur.
          minTotalViews: 0,
          minMedianViews: 0,
          minSlideshowShare: 0.5,
          minFollowers: 2000,
        },
        requestId: crypto.randomUUID(),
      });
      setLastRun(job.id);
      setScope("run");
      setShown(PAGE);
      await load();
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
    try {
      await api(`/api/research/jobs/${activeId}`, { action: "stop" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "research_failed");
    }
  }

  const found = wall.length;
  const visible = wall.slice(0, shown);

  return (
    <div className="ss-rs ss-page-enter">
      <div className="ss-rs__bar">
        <div className="ss-rs__title">
          <h1>{tr("Recherche", "Research")}</h1>
          <p className="ss-rs__summary" key={summary}>{summary}</p>
        </div>

        <form className="ss-rs__field lg lg--lens" onSubmit={start} role="search">
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

        <div className="ss-rs__dials">
          <Pill
            label={tr("Vues minimum par post", "Minimum views per post")}
            options={VIEW_STEPS.map((v) => ({ value: v, label: viewLabel(v) }))}
            value={minPostViews}
            onChange={(v) => { setMinPostViews(v); setShown(PAGE); }}
            disabled={isHandle}
            title={isHandle ? tr("Sans effet sur un compte précis", "No effect on a single account") : undefined}
          />
          <Pill
            label={tr("Période de publication", "Published within")}
            options={DAY_STEPS.map((v) => ({ value: v, label: dayLabel(v) }))}
            value={days}
            onChange={(v) => { setDays(v); setShown(PAGE); }}
          />
          {runHandles.size ? (
            <div className="ss-seg ss-rs__scope" role="group" aria-label={tr("Portée", "Scope")}>
              <button type="button" className={scope === "run" ? "is-on" : ""} onClick={() => setScope("run")}>
                {tr("Cette recherche", "This search")}
              </button>
              <button type="button" className={scope === "all" ? "is-on" : ""} onClick={() => setScope("all")}>
                {tr("Tout", "Everything")}
              </button>
            </div>
          ) : null}
        </div>

        {run && LIVE.has(run.status) ? (
          <div className="ss-rs__hunt">
            <TikTokScanLine
              kind={run.current.kind}
              target={run.current.label}
              done={found}
              total={Math.max(found, run.progress.target)}
              english={english}
            >
              <span className="ss-rs__count">{found} {plural(found, tr("carrousel", "carousel"), tr("carrousels", "carousels"))}</span>
              <button type="button" className="ss-btn-ghost ss-btn-icon lg-press" onClick={() => void stop()}>
                {tr("Arrêter", "Stop")}
              </button>
            </TikTokScanLine>
          </div>
        ) : null}

        {error ? <p className="ss-rs__err" role="alert">{errorName(error)}</p> : null}
        {run && run.input.source === "browser" && LIVE.has(run.status) ? (
          <p className="ss-rs__jobid">npm run research:browser -- --job {run.id}</p>
        ) : null}
      </div>

      {visible.length || waiting.length ? (
        <>
          <ul className="ss-rs__wall">
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
            {waiting.map((candidate, i) => {
              // La recherche rapporte deja le meilleur carrousel du candidat :
              // l'afficher fait du temps d'attente du contenu, pas un rectangle gris.
              const preview = candidate.posts?.[0];
              return (
                <li key={`pending:${candidate.handle}`} className="is-hunting" style={{ "--i": Math.min(visible.length + i, 11) } as CSSProperties}>
                  {preview ? (
                    <PostTile
                      post={preview as AccountVideo}
                      en={english}
                      author={{ handle: candidate.handle, avatar: candidate.avatar || undefined }}
                      onOpen={(slide) => setOpen({ post: preview as AccountVideo, handle: candidate.handle, accountId: "", slide })}
                    />
                  ) : (
                    <article className="ss-posttile" aria-busy="true">
                      <div className="ss-posttile__media">
                        <div className="ss-rs__wait">
                          {candidate.avatar ? <img src={coverSrc(candidate.avatar)} alt="" loading="lazy" /> : null}
                        </div>
                      </div>
                      <span className="ss-posttile__author">
                        <span aria-hidden />
                        <b>@{candidate.handle}</b>
                      </span>
                      <dl className="ss-posttile__counts">
                        <div><dt>{tr("Vues", "Views")}</dt><dd>—</dd></div>
                        <div><dt>Likes</dt><dd>—</dd></div>
                      </dl>
                    </article>
                  )}
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
        <section className="ss-empty">
          <h2>{loading ? tr("Chargement…", "Loading…") : tr("Trouve des carrousels qui marchent", "Find carousels that work")}</h2>
          <p>
            {available
              ? tr("Tape une niche, ou un @compte à analyser.", "Type a niche, or an @account to analyze.")
              : tr("La collecte cloud n'est pas configurée.", "Cloud collection is not configured.")}
          </p>
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
