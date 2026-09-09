"use client";

import { t } from "@/lib/i18n";
import type { AccountInsights } from "@/lib/insights";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { compact, type FanItem } from "./AccountsFan";
import { IconChevron } from "./icons";
import { useStudio } from "./StudioContext";
import { FxImage } from "@/components/fx/FxImage";
import { LoadingOrb, Orb } from "@/components/fx/Orb";

type Tab = "overview" | "videos" | "formats" | "revenue";
type Range = 30 | 90 | "all";
type Kind = "all" | "photo" | "video";
type Sort = "views" | "likes" | "comments" | "shares" | "engagement" | "recent";

const PAGE = 24;

/** TikTok covers are hotlink-protected: always go through our own proxy. */
function coverSrc(url: string) {
  if (!url) return "";
  if (!/^https:\/\//.test(url)) return url;
  return `/api/studio/tiktok/cover?url=${encodeURIComponent(url)}`;
}

/** The post id is enough to embed the real TikTok, video or carousel alike. */
function embedId(video: { id: string; url: string }) {
  const fromUrl = video.url.match(/\/(?:video|photo)\/(\d+)/)?.[1];
  const id = fromUrl || video.id;
  return /^\d{6,}$/.test(id) ? id : null;
}

function engagementOf(v: { views: number; likes: number; comments: number; shares: number }) {
  return v.views ? Math.round(((v.likes + v.comments + v.shares) / v.views) * 1000) / 10 : 0;
}

function euro(n: number, en: boolean) {
  return n.toLocaleString(en ? "en-US" : "fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: n >= 100 ? 0 : 2 });
}

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
  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState<Range>(30);
  const [data, setData] = useState<AccountInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("all");
  const [sort, setSort] = useState<Sort>("views");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [openPost, setOpenPost] = useState<string | null>(null);
  const [rpmDraft, setRpmDraft] = useState("");
  const [declaredDraft, setDeclaredDraft] = useState("");
  const abort = useRef<AbortController | null>(null);

  const key = item?.id || null;

  useEffect(() => {
    setShown(PAGE);
    setOpenPost(null);
  }, [key, range, kind, sort, query]);

  useEffect(() => {
    if (!key) {
      setData(null);
      return;
    }
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
          setData(json);
          setRpmDraft(String(json.revenue.rpm));
          setDeclaredDraft(json.revenue.declared ? String(json.revenue.declared) : "");
        })
        .catch((err) => {
          if (err?.name !== "AbortError") setError(t("Impossible de charger les statistiques.", "Could not load the stats.", en));
        })
        .finally(() => setLoading(false));
    }, 260);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, range]);

  async function fetchVideos() {
    if (!key) return;
    setFetching(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, action: "fetch_videos", days: range }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          json.error === "no_key"
            ? t("Les métriques publiques ne sont pas disponibles sur cet environnement.", "Public metrics are unavailable on this environment.", en)
            : json.error === "empty"
              ? t("Aucune vidéo publique trouvée pour ce compte.", "No public video found for this account.", en)
              : t("La lecture des vidéos a échoué, réessaie.", "Reading the videos failed, try again.", en),
        );
        return;
      }
      setData(json);
      setTab("videos");
    } finally {
      setFetching(false);
    }
  }

  async function saveRevenue() {
    if (!key) return;
    const rpm = Number(rpmDraft.replace(",", "."));
    const declared = Number(declaredDraft.replace(",", "."));
    const res = await fetch("/api/studio/insights", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key,
        rpm: Number.isFinite(rpm) ? rpm : undefined,
        declaredRevenue: Number.isFinite(declared) ? declared : undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setData((prev) => (prev ? { ...prev, revenue: json.revenue } : json));
  }

  const videos = useMemo(() => {
    const all = data?.videos || [];
    const needle = query.trim().toLowerCase();
    const filtered = all.filter((v) => {
      if (kind !== "all" && v.kind !== kind) return false;
      return !needle || v.title.toLowerCase().includes(needle);
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
  }, [data, kind, sort, query]);

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
            <dd>{s ? compact(s.views) : "—"}</dd>
          </div>
          <div>
            <dt>{t("Vues moy.", "Avg views", en)}</dt>
            <dd>{s ? compact(s.avgViews) : "—"}</dd>
          </div>
          <div>
            <dt>{t("Revenus estimés", "Est. revenue", en)}</dt>
            <dd>{data ? euro(data.revenue.estimated, en) : "—"}</dd>
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
            {(["overview", "videos", "formats", "revenue"] as const).map((id) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}>
                {id === "overview"
                  ? t("Aperçu", "Overview", en)
                  : id === "videos"
                    ? t("Vidéos", "Videos", en)
                    : id === "formats"
                      ? t("Formats", "Formats", en)
                      : t("Revenus", "Revenue", en)}
              </button>
            ))}
          </div>
          <div className="ss-acc__range">
            {([30, 90, "all"] as const).map((r) => (
              <button key={String(r)} type="button" className={range === r ? "is-on" : ""} onClick={() => setRange(r)}>
                {r === "all" ? t("Tout", "All", en) : `${r}j`}
              </button>
            ))}
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

        {error ? <p className="ss-acc__error">{error}</p> : null}

        {loading && !data ? <LoadingOrb state="searching" text={t("Lecture des statistiques…", "Reading the stats…", en)} /> : null}

        {data && tab === "overview" ? (
          <div className="ss-acc__grid">
            <Stat label={t("Abonnés", "Followers", en)} value={compact(s!.followers)} sub={s!.growth ? `${s!.growth.followers >= 0 ? "+" : ""}${compact(s!.growth.followers)} · ${rangeLabel}` : undefined} />
            <Stat label="Likes" value={compact(s!.likes)} />
            <Stat label="Posts" value={compact(s!.posts)} />
            <Stat label={`${t("Vues", "Views", en)} · ${rangeLabel}`} value={compact(s!.views)} sub={data.source === "none" ? t("aucune donnée vidéo", "no video data", en) : undefined} />
            <Stat label={t("Vues moyennes", "Average views", en)} value={compact(s!.avgViews)} sub={`${t("médiane", "median", en)} ${compact(s!.medianViews)}`} />
            <Stat label={t("Meilleur post", "Best post", en)} value={compact(s!.bestViews)} sub={t("vues", "views", en)} />
            <Stat label={t("Engagement", "Engagement", en)} value={`${s!.engagement}%`} sub={t("likes + comm. + partages / vues", "likes + comments + shares / views", en)} />
            <Stat label={t("Commentaires", "Comments", en)} value={compact(s!.comments)} sub={`${compact(s!.shares)} ${t("partages", "shares", en)}`} />
            <Stat label={t("Rythme", "Cadence", en)} value={`${s!.cadence}`} sub={t("posts / semaine", "posts / week", en)} />
            <Stat label={t("Part du réseau", "Share of network", en)} value={`${s!.share}%`} />
            <Stat label={t("Revenus estimés", "Estimated revenue", en)} value={euro(data.revenue.estimated, en)} sub={`${data.revenue.rpm} € / 1k ${t("vues", "views", en)}`} accent />
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
                  <button type="button" className="ss-fan__chip is-on" disabled={fetching} onClick={fetchVideos}>
                    {fetching ? <Orb size={20} state="searching" invert /> : null}
                    {fetching ? t("Analyse…", "Analysing…", en) : t("Analyser les vidéos", "Analyse the videos", en)}
                  </button>
                ) : (
                  <span>{item.kind === "clipper" ? t("Lecture des posts publics indisponible ici.", "Reading public posts is unavailable here.", en) : t("Connecte le compte pour lire ses vidéos.", "Connect the account to read its videos.", en)}</span>
                )}
              </div>
            )}
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
            <div className="ss-acc__filters">
              <input
                className="ss-input ss-acc__search"
                type="search"
                value={query}
                placeholder={t("Chercher dans les légendes…", "Search the captions…", en)}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={t("Chercher un post", "Search a post", en)}
              />
              <div className="ss-acc__range" role="group" aria-label={t("Type de post", "Post type", en)}>
                {(["all", "photo", "video"] as const).map((k) => (
                  <button key={k} type="button" className={kind === k ? "is-on" : ""} onClick={() => setKind(k)}>
                    {k === "all" ? t("Tout", "All", en) : k === "photo" ? t("Carrousels", "Carousels", en) : t("Vidéos", "Videos", en)}
                  </button>
                ))}
              </div>
              <label className="ss-acc__sort">
                <span>{t("Trier par", "Sort by", en)}</span>
                <select className="ss-input" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="views">{t("Vues", "Views", en)}</option>
                  <option value="likes">Likes</option>
                  <option value="comments">{t("Commentaires", "Comments", en)}</option>
                  <option value="shares">{t("Partages", "Shares", en)}</option>
                  <option value="engagement">{t("Engagement", "Engagement", en)}</option>
                  <option value="recent">{t("Plus récents", "Most recent", en)}</option>
                </select>
              </label>
              <div className="ss-acc__range" role="group" aria-label={t("Affichage", "Layout", en)}>
                {(["grid", "list"] as const).map((l) => (
                  <button key={l} type="button" className={layout === l ? "is-on" : ""} onClick={() => setLayout(l)}>
                    {l === "grid" ? t("Galerie", "Gallery", en) : t("Liste", "List", en)}
                  </button>
                ))}
              </div>
              {data.canFetch ? (
                <button type="button" className="ss-fan__chip" disabled={fetching} onClick={fetchVideos}>
                  {fetching ? <Orb size={20} state="searching" /> : null}
                  {fetching ? t("Analyse…", "Analysing…", en) : data.videos.length ? t("Actualiser", "Refresh", en) : t("Analyser les posts", "Analyse the posts", en)}
                </button>
              ) : null}
            </div>

            <div className="ss-acc__videos-head">
              <span className="ss-acc__muted">
                {videos.length
                  ? `${videos.length} ${t("posts", "posts", en)} · ${compact(filteredTotals.views)} ${t("vues", "views", en)} · ${compact(filteredTotals.avgViews)} ${t("vues moy.", "avg views", en)} · ${filteredTotals.engagement}% ${t("engagement", "engagement", en)} · ${rangeLabel}`
                  : data.videos.length
                    ? t("Aucun post ne correspond à ce filtre.", "No post matches this filter.", en)
                    : t("Aucun post sur cette période.", "No post in this range.", en)}
                {data.fetchedAt ? ` · ${t("lu le", "read on", en)} ${new Date(data.fetchedAt).toLocaleDateString(en ? "en-US" : "fr-FR")}` : ""}
              </span>
            </div>

            {!data.videos.length && !data.canFetch ? (
              <p className="ss-acc__muted">
                {t("Connecte le compte ou active les métriques publiques pour lire ses posts.", "Connect the account or enable public metrics to read its posts.", en)}
              </p>
            ) : null}

            {layout === "grid" ? (
              <ul className="ss-acc__gallery">
                {videos.slice(0, shown).map((v) => (
                  <li key={v.id}>
                    <button type="button" className="ss-acc__tile lg-press" onClick={() => setOpenPost(v.id)}>
                      {/* La signature de la vignette expire côté TikTok : le glyphe reste dessous. */}
                      <span className="ss-acc__tile-blank">{v.kind === "photo" ? "▦" : "▶"}</span>
                      {v.cover ? (
                        <img
                          src={coverSrc(v.cover)}
                          alt=""
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.hidden = true;
                          }}
                        />
                      ) : null}
                      <span className="ss-acc__tile-kind">{v.kind === "photo" ? t("Carrousel", "Carousel", en) : t("Vidéo", "Video", en)}</span>
                      <span className="ss-acc__tile-meta">
                        <b>{compact(v.views)}</b> {t("vues", "views", en)} · {compact(v.likes)} likes · {engagementOf(v)}%
                      </span>
                      <span className="ss-acc__tile-title">{v.title || t("Sans titre", "Untitled", en)}</span>
                    </button>
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
                    <button type="button" className="ss-acc__vtitle ss-acc__vopen" onClick={() => setOpenPost(v.id)}>
                      <b>{v.title || t("Sans titre", "Untitled", en)}</b>
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
                    <button type="button" className="ss-fan__chip" onClick={() => setOpenPost(v.id)}>
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
                <small>{t("Hooks qui marchent (début des titres)", "Hooks that work (title openings)", en)}</small>
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

        {data && tab === "revenue" ? (
          <div className="ss-acc__revenue">
            <div className="ss-acc__grid">
              <Stat label={t("Revenus estimés", "Estimated revenue", en)} value={euro(data.revenue.estimated, en)} sub={`${compact(data.revenue.views)} ${t("vues", "views", en)} × ${data.revenue.rpm} € / 1k · ${rangeLabel}`} accent />
              <Stat label={t("Revenus déclarés", "Declared revenue", en)} value={euro(data.revenue.declared, en)} sub={t("ce que le compte a réellement rapporté", "what the account really paid out", en)} />
              <Stat label={t("Par post", "Per post", en)} value={data.videos.length ? euro(data.revenue.estimated / data.videos.length, en) : "—"} />
              <Stat label={t("Par 1k abonnés", "Per 1k followers", en)} value={s!.followers ? euro((data.revenue.estimated / s!.followers) * 1000, en) : "—"} />
            </div>
            <form
              className="ss-acc__revform"
              onSubmit={(e) => {
                e.preventDefault();
                saveRevenue();
              }}
            >
              <label>
                <span>{t("RPM (€ pour 1 000 vues)", "RPM (€ per 1,000 views)", en)}</span>
                <input className="ss-input" inputMode="decimal" value={rpmDraft} onChange={(e) => setRpmDraft(e.target.value)} />
              </label>
              <label>
                <span>{t("Revenus réels (€)", "Real revenue (€)", en)}</span>
                <input className="ss-input" inputMode="decimal" value={declaredDraft} placeholder="0" onChange={(e) => setDeclaredDraft(e.target.value)} />
              </label>
              <button type="submit" className="ss-fan__chip is-on">
                {t("Enregistrer", "Save", en)}
              </button>
            </form>
            <p className="ss-acc__muted">
              {t(
                "L'estimation applique ton RPM aux vues de la période. Renseigne les revenus réels (Creator Rewards, deals UGC, commissions) pour comparer.",
                "The estimate applies your RPM to the period's views. Enter real revenue (Creator Rewards, UGC deals, commissions) to compare.",
                en,
              )}
            </p>
          </div>
        ) : null}
      </div>

      {current ? <PostViewer video={current} handle={item.handle} en={en} onClose={() => setOpenPost(null)} /> : null}
    </div>
  );
}

/**
 * Le post entier, dans le studio : l'embed officiel TikTok joue la vidéo ou
 * fait défiler le carrousel, et les compteurs de la période sont à côté.
 */
function PostViewer({
  video,
  handle,
  en,
  onClose,
}: {
  video: AccountInsights["videos"][number];
  handle: string;
  en: boolean;
  onClose: () => void;
}) {
  const id = embedId(video);
  const link = video.url || (id ? `https://www.tiktok.com/@${handle}/${video.kind === "photo" ? "photo" : "video"}/${id}` : "");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  // Le panneau crée son propre contexte d'empilement : le lecteur doit sortir
  // du DOM du panneau pour passer au-dessus du chrome flottant du studio.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="ss-postview" role="dialog" aria-modal="true" aria-label={video.title || t("Post TikTok", "TikTok post", en)}>
      <button type="button" className="ss-postview__scrim" aria-label={t("Fermer", "Close", en)} onClick={onClose} />
      <div className="ss-postview__sheet lg">
        <header className="ss-postview__head">
          <div>
            <small>@{handle} · {video.kind === "photo" ? t("Carrousel", "Carousel", en) : t("Vidéo", "Video", en)}</small>
            <b>{video.title || t("Sans titre", "Untitled", en)}</b>
          </div>
          <button type="button" className="ss-fan__chip lg-press" onClick={onClose}>
            {t("Fermer", "Close", en)}
          </button>
        </header>

        <div className="ss-postview__body">
          <div className="ss-postview__player">
            {id ? (
              <iframe
                key={id}
                src={`https://www.tiktok.com/embed/v2/${id}`}
                title={video.title || `TikTok ${id}`}
                allow="encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : video.cover ? (
              <img src={coverSrc(video.cover)} alt="" />
            ) : (
              <p className="ss-acc__muted">{t("Ce post n'a pas d'identifiant TikTok lisible.", "This post has no readable TikTok id.", en)}</p>
            )}
          </div>

          <div className="ss-postview__side">
            <dl className="ss-postview__stats">
              <div>
                <dt>{t("Vues", "Views", en)}</dt>
                <dd>{video.views.toLocaleString(en ? "en-US" : "fr-FR")}</dd>
              </div>
              <div>
                <dt>Likes</dt>
                <dd>{video.likes.toLocaleString(en ? "en-US" : "fr-FR")}</dd>
              </div>
              <div>
                <dt>{t("Commentaires", "Comments", en)}</dt>
                <dd>{video.comments.toLocaleString(en ? "en-US" : "fr-FR")}</dd>
              </div>
              <div>
                <dt>{t("Partages", "Shares", en)}</dt>
                <dd>{video.shares.toLocaleString(en ? "en-US" : "fr-FR")}</dd>
              </div>
              <div>
                <dt>{t("Engagement", "Engagement", en)}</dt>
                <dd>{engagementOf(video)}%</dd>
              </div>
              <div>
                <dt>{t("Publié le", "Published", en)}</dt>
                <dd>{video.createdAt ? new Date(video.createdAt * 1000).toLocaleDateString(en ? "en-US" : "fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—"}</dd>
              </div>
            </dl>
            {video.title ? <p className="ss-postview__caption">{video.title}</p> : null}
            {link ? (
              <a href={link} target="_blank" rel="noreferrer" className="ss-fan__chip is-on lg-press">
                {t("Ouvrir sur TikTok ↗", "Open on TikTok ↗", en)}
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

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
