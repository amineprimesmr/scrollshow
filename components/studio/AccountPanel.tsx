"use client";

import { PublicationTextSearch } from "./PublicationTextSearch";
import { matchingSlide, normalizeSlideSearch, publicationTextProgress } from "@/lib/publication-text";
import "./account-gallery.css";
import { t } from "@/lib/i18n";
import type { AccountInsights } from "@/lib/insights";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { compact, type FanItem } from "./AccountsFan";
import { PostTile } from "./PostTile";
import { PostViewer } from "./PostViewer";
import { engagementOf } from "./post-meta";
import { IconChevron } from "./icons";
import { coverSrc } from "./cover";
import { useStudio } from "./StudioContext";
import { FxImage } from "@/components/fx/FxImage";
import { LoadingOrb, Orb } from "@/components/fx/Orb";

type Tab = "overview" | "videos" | "formats";
type Range = 30 | 90 | "all";
type Kind = "all" | "photo" | "video";
type Sort = "views" | "likes" | "comments" | "shares" | "engagement" | "recent";

const PAGE = 24;



function dateOf(unix: number, en: boolean) {
  if (!unix) return "";
  return new Date(unix * 1000).toLocaleDateString(en ? "en-US" : "fr-FR", { day: "numeric", month: "short" });
}

export function AccountPanel({
  item,
  expanded,
  onToggle,
}: {
  item: FanItem | null;
  expanded: boolean;
  onToggle: (open: boolean) => void;
}) {
  const router = useRouter();
  const { english: en, setActiveChannel } = useStudio();
  const [tab, setTab] = useState<Tab>("videos");
  const [range, setRange] = useState<Range>("all");
  const [data, setData] = useState<AccountInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [query, setQuery] = useState("");
  const [hookOnly, setHookOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [openSlide, setOpenSlide] = useState(0);
  function openPublication(id: string, slide = 0) { setOpenSlide(slide); setOpenPost(id); }
  const [openPost, setOpenPost] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const key = item?.id || null;

  useEffect(() => {
    setShown(PAGE);
    setOpenPost(null);
  }, [key, range, kind, sort, query, hookOnly]);

  useEffect(() => {
    if (!key) {
      setData(null);
      return;
    }
    setData(null);
    let active = true;
    // Scrubbing the fan changes the selection quickly: wait for it to settle.
    const handle = window.setTimeout(() => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setLoading(true);
      setError(null);
      fetch(`/api/studio/insights?key=${encodeURIComponent(key)}&days=${range}`, { signal: controller.signal })
        .then(async (res) => {
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || "failed");
          if (active) setData(json);
        })
        .catch((err) => {
          if (active && err?.name !== "AbortError") setError(t("Impossible de charger les statistiques.", "Could not load the stats.", en));
        })
        .finally(() => { if (active) setLoading(false); });
    }, 260);
    return () => { active = false; window.clearTimeout(handle); abort.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, range]);

  const selection = useRef<string | null>(null);
  useEffect(() => () => { selection.current = null; }, []);
  selection.current = `${key}:${range}`;
  const syncing = useRef(false);
  const autoStarted = useRef<string | null>(null);

  async function fetchVideos() {
    if (!key || syncing.current) return;
    const requestedKey = key;
    const requestedSelection = `${key}:${range}`;
    syncing.current = true;
    setFetching(true);
    setError(null);
    let restart = Boolean(data?.sync?.complete);
    try {
      // Each HTTP request commits one page. Switching account pauses this loop;
      // reopening it resumes from the persisted cursor.
      while (selection.current === requestedSelection) {
        const res = await fetch("/api/studio/insights", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: requestedKey, action: "fetch_videos", days: range, restart }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "sync_failed");
        if (selection.current !== requestedSelection) break;
        setData(json);
        restart = false;
        if (!json.sync?.hasMore) break;
      }
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : "sync_failed";
      const reconnect = /scope|token|connection_required|unauthorized/.test(code);
      if (selection.current === requestedSelection) setError(reconnect
        ? t("Autorisation TikTok expirée ou incomplète. Reconnecte ce compte depuis Comptes. Les posts chargés sont conservés.", "TikTok permission expired or incomplete. Reconnect this account from Accounts. Loaded posts are preserved.", en)
        : t("Lecture interrompue par le service de données. Les posts chargés sont conservés ; reprends la synchronisation dans un moment.", "The data service interrupted the sync. Loaded posts are preserved; resume syncing in a moment.", en));
    } finally {
      syncing.current = false;
      setFetching(false);
    }
  }

  useEffect(() => {
    if (!key || !data || data.key !== key || !data.canFetch || fetching || autoStarted.current === key || data.sync?.error) return;
    if (!data.sync?.complete || (data.fetchedAt && Date.now() - Date.parse(data.fetchedAt) > 6 * 3600000)) {
      autoStarted.current = key;
      void fetchVideos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, data, fetching]);

  const metricValue = (value: number, metric = "views", suffix = "") => {
    const missing = !data || (data.source === "none" && !data.sync?.complete) || data.stats.missingMetrics?.includes(metric);
    return missing ? "—" : `${compact(value)}${suffix}`;
  };

  const videos = useMemo(() => {
    const all = data?.videos || [];
    const needle = normalizeSlideSearch(query);
    const filtered = all.filter((v) => {
      if (kind !== "all" && v.kind !== kind) return false;
      return !needle || Boolean(matchingSlide(v, needle, hookOnly));
    });
    const rank: Record<Sort, (v: (typeof all)[number]) => number> = {
      views: (v) => v.views,
      likes: (v) => v.likes,
      comments: (v) => v.comments,
      shares: (v) => v.shares,
      engagement: (v) => engagementOf(v),
      recent: (v) => v.createdAt,
    };
    return [...filtered].sort((a, b) => rank[sort](b) - rank[sort](a));
  }, [data, kind, sort, query, hookOnly]);

  const filteredTotals = useMemo(() => {
    const views = videos.reduce((n, v) => n + v.views, 0);
    const inter = videos.reduce((n, v) => n + v.likes + v.comments + v.shares, 0);
    return {
      views,
      likes: videos.reduce((n, v) => n + v.likes, 0),
      comments: videos.reduce((n, v) => n + v.comments, 0),
      shares: videos.reduce((n, v) => n + v.shares, 0),
      engagement: views ? Math.round((inter / views) * 1000) / 10 : 0,
      avgViews: videos.length ? Math.round(views / videos.length) : 0,
    };
  }, [videos]);

  function openCalendar() {
    if (!item) return;
    if (item.kind === "channel") setActiveChannel(item.id.slice(3));
    router.push("/app");
  }

  if (!item) return null;
  const s = data?.stats;
  const current = openPost ? (data?.videos || []).find((v) => v.id === openPost) || null : null;
  const rangeLabel = range === "all" ? t("Tout", "All", en) : `${range} ${t("jours", "days", en)}`;

  return (
    <div className={`ss-acc ${expanded ? "is-open" : ""}`}>
      <button type="button" className="ss-acc__bar" onClick={() => onToggle(!expanded)} aria-expanded={expanded}>
        <div className="ss-acc__id">
          {item.avatar ? <img src={item.avatar} alt="" /> : <span>{item.handle.slice(0, 2).toUpperCase()}</span>}
          <div>
            <b>{item.name}</b>
            <span>
              @{item.handle} · {item.platform === "tiktok" ? "TikTok" : item.platform === "instagram" ? "Instagram" : item.platform}
            </span>
          </div>
          <span className={`ss-badge ${item.connected ? "is-ready" : "is-wait"}`}>
            {item.connected ? t("Connecté", "Connected", en) : item.kind === "clipper" ? t("Réseau", "Network", en) : t("Lié", "Linked", en)}
          </span>
        </div>
        <dl className="ss-acc__quick">
          <div>
            <dt>{t("Abonnés", "Followers", en)}</dt>
            <dd>{compact(item.followers)}</dd>
          </div>
          <div>
            <dt>{t("Vues", "Views", en)} · {rangeLabel}</dt>
            <dd>{s ? metricValue(s.views) : "—"}</dd>
          </div>
          <div>
            <dt>{t("Vues moy.", "Avg views", en)}</dt>
            <dd>{s ? metricValue(s.avgViews) : "—"}</dd>
          </div>
          <div>
            <dt>{t("Publications chargées", "Loaded posts", en)}</dt>
            <dd>{data ? data.sync?.loaded ?? data.videos.length : "—"}</dd>
          </div>
        </dl>
        <span className="ss-acc__toggle">
          {expanded ? t("Réduire", "Collapse", en) : t("Détails", "Details", en)}
          <span className={`ss-acc__chev ${expanded ? "is-open" : ""}`}>
            <IconChevron dir="down" size={16} />
          </span>
        </span>
      </button>

      <div className="ss-acc__body" aria-hidden={!expanded}>
        <div className="ss-acc__head">
          <div className="ss-acc__tabs" role="tablist">
            {(["overview", "videos", "formats"] as const).map((id) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}>
                {id === "overview"
                  ? t("Aperçu", "Overview", en)
                  : id === "videos"
                    ? t("Publications", "Posts", en)
                    : t("Formats", "Formats", en)}
              </button>
            ))}
          </div>
          <div className="ss-acc__group ss-acc__group--inline">
            <span className="ss-acc__group-label">{t("Période", "Period", en)}</span>
            <div className="ss-acc__range" role="group" aria-label={t("Période", "Period", en)}>
              {([30, 90, "all"] as const).map((r) => (
                <button key={String(r)} type="button" className={range === r ? "is-on" : ""} onClick={() => setRange(r)}>
                  {r === "all" ? t("Tout", "All", en) : `${r}j`}
                </button>
              ))}
            </div>
          </div>
          <div className="ss-acc__actions">
            {item.kind === "channel" ? (
              <button type="button" className="ss-fan__chip is-on" onClick={openCalendar}>
                {t("Calendrier", "Calendar", en)}
              </button>
            ) : null}
            <a href={`https://www.tiktok.com/@${item.handle}`} target="_blank" rel="noreferrer" className="ss-fan__chip">
              TikTok ↗
            </a>
          </div>
        </div>

        {data ? <div className={`ss-acc__status${fetching ? " is-busy" : data.sync?.complete ? " is-ok" : " is-partial"}`} role="status">
          <span className="ss-acc__status-dot" aria-hidden />
          <span className="ss-acc__status-text">
            <b>{fetching ? t("Synchronisation…", "Syncing…", en) : data.sync?.complete ? t("À jour", "Up to date", en) : t("Historique partiel", "Partial history", en)}</b>
            {" · "}{data.sync?.loaded ?? data.videos.length} {t("posts", "posts", en)}
            {data.fetchedAt ? ` · ${t("lu le", "read on", en)} ${new Date(data.fetchedAt).toLocaleDateString(en ? "en-US" : "fr-FR", { day: "numeric", month: "short" })}` : ""}
          </span>
          {data.canFetch ? <button type="button" className="ss-fan__chip lg-press" disabled={fetching} onClick={() => void fetchVideos()}>
            {fetching ? <Orb size={20} state="searching" /> : null}
            {fetching ? t("Chargement…", "Loading…", en) : data.sync?.complete ? t("Actualiser", "Refresh", en) : t("Reprendre", "Resume", en)}
          </button> : null}
        </div> : null}
        {error ? <p className="ss-acc__error">{error}</p> : null}

        {loading && !data ? <LoadingOrb state="searching" text={t("Lecture des statistiques…", "Reading the stats…", en)} /> : null}

        {data && tab === "overview" ? (
          <div className="ss-acc__grid">
            <Stat label={t("Abonnés", "Followers", en)} value={compact(s!.followers)} sub={s!.growth ? `${s!.growth.followers >= 0 ? "+" : ""}${compact(s!.growth.followers)} · ${rangeLabel}` : undefined} />
            <Stat label="Likes" value={compact(s!.likes)} />
            <Stat label="Posts" value={compact(s!.posts)} />
            <Stat label={`${t("Vues", "Views", en)} · ${rangeLabel}`} value={metricValue(s!.views)} sub={data.source === "none" ? t("aucune donnée vidéo", "no video data", en) : undefined} />
            <Stat label={t("Vues moyennes", "Average views", en)} value={metricValue(s!.avgViews)} sub={`${t("médiane", "median", en)} ${metricValue(s!.medianViews)}`} />
            <Stat label={t("Meilleur post", "Best post", en)} value={metricValue(s!.bestViews)} sub={t("vues", "views", en)} />
            <Stat label={t("Engagement", "Engagement", en)} value={data.stats.missingMetrics?.some(m => ["views", "likes", "comments", "shares"].includes(m)) ? "—" : metricValue(s!.engagement, "views", "%")} sub={t("likes + comm. + partages / vues", "likes + comments + shares / views", en)} />
            <Stat label={t("Commentaires", "Comments", en)} value={metricValue(s!.comments, "comments")} sub={`${metricValue(s!.shares, "shares")} ${t("partages", "shares", en)}`} />
            <Stat label={t("Rythme", "Cadence", en)} value={`${s!.cadence}`} sub={t("posts / semaine", "posts / week", en)} />
            <Stat label={t("Part du réseau", "Share of network", en)} value={`${s!.share}%`} />
            {data.timeline.length > 1 ? <Trend points={data.timeline} en={en} /> : null}
            {data.videos[0] ? (
              <a className="ss-acc__best" href={data.videos[0].url || undefined} target="_blank" rel="noreferrer">
                {data.videos[0].cover ? <FxImage src={coverSrc(data.videos[0].cover)} width={56} height={74} radius={10} preset="pixels-mechanic" /> : <span />}
                <div>
                  <small>{t("Meilleure vidéo", "Best video", en)}</small>
                  <b>{data.videos[0].title || t("Sans titre", "Untitled", en)}</b>
                  <span>
                    {compact(data.videos[0].views)} {t("vues", "views", en)} · {compact(data.videos[0].likes)} likes · {dateOf(data.videos[0].createdAt, en)}
                  </span>
                </div>
              </a>
            ) : (
              <div className="ss-acc__best is-empty">
                <b>{t("Pas encore de vidéos analysées", "No videos analysed yet", en)}</b>
                {data.canFetch ? (
                  <button type="button" className="ss-fan__chip is-on" disabled={fetching} onClick={() => void fetchVideos()}>
                    {fetching ? <Orb size={20} state="searching" invert /> : null}
                    {fetching ? t("Analyse…", "Analysing…", en) : t("Analyser les vidéos", "Analyse the videos", en)}
                  </button>
                ) : (
                  <span>{item.kind === "clipper" ? t("Lecture des posts publics indisponible ici.", "Reading public posts is unavailable here.", en) : t("Connecte le compte pour lire ses vidéos.", "Connect the account to read its videos.", en)}</span>
                )}
              </div>
            )}
            <p className="ss-acc__footnote">{t("Totaux des posts publiés sur la période choisie. Les ventes ne sont pas mesurées.", "Totals for posts published in the selected period. Sales are not tracked.", en)}</p>
            {data.studio.posts ? (
              <div className="ss-acc__studio">
                <small>ScrollShow</small>
                <b>
                  {data.studio.published} {t("publiés", "published", en)} · {data.studio.scheduled} {t("planifiés", "scheduled", en)}
                </b>
                <span>
                  {compact(data.studio.views)} {t("vues sur les posts ScrollShow", "views on ScrollShow posts", en)}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {data && tab === "videos" ? (
          <div className="ss-acc__videos">
            <div className="ss-acc__toolbar">
              <PublicationTextSearch key={`${key}:${range}`} accountKey={key!} range={range} videos={data.videos} query={query} onQuery={setQuery}
                hookOnly={hookOnly} onScope={setHookOnly} priorityPostId={openPost || undefined} en={en} onUpdate={(updates, hooks) => setData(previous => {
                  if (!previous || previous.key !== key) return previous;
                  const indexed = new Map(updates.map(v => [v.id, v.slideTexts]));
                  return { ...previous, hooks, videos: previous.videos.map(v => indexed.has(v.id) ? { ...v, slideTexts: indexed.get(v.id) } : v) };
                })} />
              <div className="ss-acc__toolbar-row">
                <div className="ss-acc__group">
                  <span className="ss-acc__group-label">{t("Type", "Type", en)}</span>
                  <div className="ss-acc__range" role="group" aria-label={t("Type de post", "Post type", en)}>
                    {(["all", "photo", "video"] as const).map((k) => (
                      <button key={k} type="button" className={kind === k ? "is-on" : ""} aria-pressed={kind === k} onClick={() => setKind(k)}>
                        {k === "all" ? t("Tout", "All", en) : k === "photo" ? t("Carrousels", "Carousels", en) : t("Vidéos", "Videos", en)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ss-acc__group">
                  <span className="ss-acc__group-label">{t("Tri", "Sort", en)}</span>
                  <label className="ss-acc__sort">
                    <select className="ss-input" value={sort} aria-label={t("Trier par", "Sort by", en)} onChange={(e) => setSort(e.target.value as Sort)}>
                      <option value="views">{t("Vues", "Views", en)}</option>
                      <option value="likes">Likes</option>
                      <option value="comments">{t("Commentaires", "Comments", en)}</option>
                      <option value="shares">{t("Partages", "Shares", en)}</option>
                      <option value="engagement">{t("Engagement", "Engagement", en)}</option>
                      <option value="recent">{t("Plus récents", "Most recent", en)}</option>
                    </select>
                  </label>
                </div>
                <div className="ss-acc__group">
                  <span className="ss-acc__group-label">{t("Affichage", "Layout", en)}</span>
                  <div className="ss-acc__range" role="group" aria-label={t("Affichage", "Layout", en)}>
                    {(["grid", "list"] as const).map((l) => (
                      <button key={l} type="button" className={layout === l ? "is-on" : ""} aria-pressed={layout === l} onClick={() => setLayout(l)}>
                        {l === "grid" ? t("Galerie", "Gallery", en) : t("Liste", "List", en)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {videos.length ? (
              <dl className="ss-acc__summary">
                <div><dd>{videos.length}</dd><dt>{t("posts", "posts", en)}</dt></div>
                <div><dd>{compact(filteredTotals.views)}</dd><dt>{t("vues", "views", en)}</dt></div>
                <div><dd>{compact(filteredTotals.avgViews)}</dd><dt>{t("vues moy.", "avg views", en)}</dt></div>
                <div><dd>{filteredTotals.engagement}%</dd><dt>{t("engagement", "engagement", en)}</dt></div>
                <div><dd>{rangeLabel}</dd><dt>{t("période", "period", en)}</dt></div>
              </dl>
            ) : (
              <p className="ss-acc__empty">
                {data.videos.length
                  ? query && publicationTextProgress(data.videos).pending
                    ? t("Aucun résultat dans les images déjà lues. La recherche se complétera au fil de la lecture.", "No matches in the images read so far. More results may appear as reading continues.", en)
                    : t("Aucun post ne correspond à ce filtre.", "No post matches this filter.", en)
                  : t("Aucun post sur cette période.", "No post in this range.", en)}
                {!data.videos.length && data.canFetch ? (
                  <button type="button" className="ss-fan__chip is-on lg-press" disabled={fetching} onClick={() => void fetchVideos()}>
                    {fetching ? <Orb size={20} state="searching" invert /> : null}
                    {fetching ? t("Analyse…", "Analysing…", en) : t("Analyser les posts", "Analyse the posts", en)}
                  </button>
                ) : null}
              </p>
            )}

            {!data.videos.length && !data.canFetch ? (
              <p className="ss-acc__muted">
                {t("Connecte le compte ou active les métriques publiques pour lire ses posts.", "Connect the account or enable public metrics to read its posts.", en)}
              </p>
            ) : null}

            {layout === "grid" ? (
              <ul className="ss-acc__gallery">
                {videos.slice(0, shown).map((v) => (
                  <li key={v.id}>
                    <PostTile
                      post={v}
                      en={en}
                      initialSlide={matchingSlide(v, query, hookOnly)?.index ?? 0}
                      onOpen={slide => openPublication(v.id, slide)}
                      footer={normalizeSlideSearch(query) ? <button type="button" className="ss-posttile__match" onClick={() => openPublication(v.id, matchingSlide(v, query, hookOnly)?.index ?? 0)}>
                        {t(`Voir le texte · slide ${(matchingSlide(v, query, hookOnly)?.index ?? 0) + 1}`, `View text · slide ${(matchingSlide(v, query, hookOnly)?.index ?? 0) + 1}`, en)}
                      </button> : null}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <ol className="ss-acc__list">
                {videos.slice(0, shown).map((v, i) => (
                  <li key={v.id}>
                    <span className="ss-acc__rank">{i + 1}</span>
                    {v.cover ? (
                      <FxImage src={coverSrc(v.cover)} width={44} height={58} radius={8} preset={i % 2 ? "pixels-mechanic" : "pixels-organic"} className="ss-acc__thumb-fx" />
                    ) : (
                      <span className="ss-acc__thumb" />
                    )}
                    <button type="button" className="ss-acc__vtitle ss-acc__vopen" onClick={() => openPublication(v.id, matchingSlide(v, query, hookOnly)?.index ?? 0)}>
                      <b>{matchingSlide(v, query, hookOnly)?.text || v.slideTexts?.[0]?.text || t("Texte de la première slide en cours de lecture", "Reading the first slide text", en)}</b>
                      <span>
                        {v.kind === "photo" ? t("Carrousel", "Carousel", en) : t("Vidéo", "Video", en)}
                        {v.createdAt ? ` · ${dateOf(v.createdAt, en)}` : ""}
                      </span>
                    </button>
                    <span className="ss-acc__num">
                      <b>{compact(v.views)}</b> {t("vues", "views", en)}
                    </span>
                    <span className="ss-acc__num">
                      <b>{compact(v.likes)}</b> likes
                    </span>
                    <span className="ss-acc__num">
                      <b>{compact(v.comments)}</b> {t("comm.", "comments", en)}
                    </span>
                    <span className="ss-acc__num">
                      <b>{compact(v.shares)}</b> {t("partages", "shares", en)}
                    </span>
                    <span className="ss-acc__num">
                      <b>{engagementOf(v)}%</b> eng.
                    </span>
                    <button type="button" className="ss-fan__chip" onClick={() => openPublication(v.id, matchingSlide(v, query, hookOnly)?.index ?? 0)}>
                      {t("Voir", "Watch", en)}
                    </button>
                  </li>
                ))}
              </ol>
            )}
            {videos.length > shown ? (
              <button type="button" className="ss-fan__chip ss-acc__more" onClick={() => setShown((n) => n + PAGE)}>
                {t(`Voir ${Math.min(PAGE, videos.length - shown)} de plus`, `Show ${Math.min(PAGE, videos.length - shown)} more`, en)}
              </button>
            ) : null}
          </div>
        ) : null}

        {data && tab === "formats" ? (
          <div className="ss-acc__formats">
            <div className="ss-acc__format-cards">
              {data.formats.length ? (
                data.formats.map((f) => (
                  <div key={f.id} className={`ss-acc__format ${f === data.formats[0] ? "is-best" : ""}`}>
                    <small>{f === data.formats[0] ? t("Format le plus fort", "Strongest format", en) : t("Format", "Format", en)}</small>
                    <b>{f.id === "photo" ? t("Carrousel photo", "Photo carousel", en) : t("Vidéo", "Video", en)}</b>
                    <span>
                      {f.count} {t("posts", "posts", en)} · {compact(f.avgViews)} {t("vues moy.", "avg views", en)} · {t("record", "best", en)} {compact(f.bestViews)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="ss-acc__muted">{t("Analyse d'abord les vidéos pour voir les formats.", "Analyse the videos first to see formats.", en)}</p>
              )}
            </div>
            {data.hooks.length ? (
              <div className="ss-acc__hooks">
                <small>{t("Hooks des premières slides · vues moyennes observées", "First-slide hooks · observed average views", en)}</small>
                <ul>
                  {data.hooks.map((h) => (
                    <li key={h.hook}>
                      <b>« {h.hook}… »</b>
                      <span>
                        {h.count}× · {compact(h.avgViews)} {t("vues moy.", "avg views", en)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

      </div>

      {current ? <PostViewer initialSlide={openSlide} video={current} handle={item.handle} en={en} onClose={() => setOpenPost(null)} /> : null}
    </div>
  );
}

/**
 * Le post entier, dans le studio : l'embed officiel TikTok joue la vidéo ou
 * fait défiler le carrousel, et les compteurs de la période sont à côté.
 */

/** Vues publiées par bucket sur la période — barres, pas de librairie. */
function Trend({ points, en }: { points: AccountInsights["timeline"]; en: boolean }) {
  const max = Math.max(...points.map((p) => p.views), 1);
  const total = points.reduce((n, p) => n + p.posts, 0);
  return (
    <div className="ss-acc__trend">
      <small>{t("Vues des posts publiés", "Views of published posts", en)}</small>
      <div className="ss-acc__bars" role="img" aria-label={t(`${total} posts sur la période`, `${total} posts over the range`, en)}>
        {points.map((p) => (
          <span
            key={p.start}
            style={{ height: `${Math.max(2, Math.round((p.views / max) * 100))}%` }}
            title={`${new Date(p.start * 1000).toLocaleDateString(en ? "en-US" : "fr-FR")} · ${compact(p.views)} ${t("vues", "views", en)} · ${p.posts} ${t("posts", "posts", en)}`}
            className={p.posts ? "is-on" : ""}
          />
        ))}
      </div>
      <span>
        {points[0]?.label} → {points[points.length - 1]?.label}
      </span>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`ss-acc__stat ${accent ? "is-accent" : ""}`}>
      <small>{label}</small>
      <b>{value}</b>
      {sub ? <span>{sub}</span> : null}
    </div>
  );
}
