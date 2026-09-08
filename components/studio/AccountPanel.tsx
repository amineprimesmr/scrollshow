"use client";

import { t } from "@/lib/i18n";
import type { AccountInsights } from "@/lib/insights";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { compact, type FanItem } from "./AccountsFan";
import { IconChevron } from "./icons";
import { useStudio } from "./StudioContext";

type Tab = "overview" | "videos" | "formats" | "revenue";
type Range = 30 | 90 | "all";

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
  const [rpmDraft, setRpmDraft] = useState("");
  const [declaredDraft, setDeclaredDraft] = useState("");
  const abort = useRef<AbortController | null>(null);

  const key = item?.id || null;

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
            ? t("Clé Monid absente côté serveur (MONID_API_KEY).", "Monid key missing on the server (MONID_API_KEY).", en)
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

  function openCalendar() {
    if (!item) return;
    if (item.kind === "channel") setActiveChannel(item.id.slice(3));
    router.push("/app");
  }

  if (!item) return null;
  const s = data?.stats;
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

        {loading && !data ? <p className="ss-acc__muted">{t("Chargement…", "Loading…", en)}</p> : null}

        {data && tab === "overview" ? (
          <div className="ss-acc__grid">
            <Stat label={t("Abonnés", "Followers", en)} value={compact(s!.followers)} sub={s!.growth ? `${s!.growth.followers >= 0 ? "+" : ""}${compact(s!.growth.followers)} · ${rangeLabel}` : undefined} />
            <Stat label="Likes" value={compact(s!.likes)} />
            <Stat label="Posts" value={compact(s!.posts)} />
            <Stat label={`${t("Vues", "Views", en)} · ${rangeLabel}`} value={compact(s!.views)} sub={data.source === "none" ? t("aucune donnée vidéo", "no video data", en) : undefined} />
            <Stat label={t("Vues moyennes", "Average views", en)} value={compact(s!.avgViews)} />
            <Stat label={t("Engagement", "Engagement", en)} value={`${s!.engagement}%`} sub={t("likes + comm. + partages / vues", "likes + comments + shares / views", en)} />
            <Stat label={t("Part du réseau", "Share of network", en)} value={`${s!.share}%`} />
            <Stat label={t("Revenus estimés", "Estimated revenue", en)} value={euro(data.revenue.estimated, en)} sub={`${data.revenue.rpm} € / 1k ${t("vues", "views", en)}`} accent />
            {data.videos[0] ? (
              <a className="ss-acc__best" href={data.videos[0].url || undefined} target="_blank" rel="noreferrer">
                {data.videos[0].cover ? <img src={data.videos[0].cover} alt="" /> : <span />}
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
                    {fetching ? t("Analyse…", "Analysing…", en) : t("Analyser les vidéos", "Analyse the videos", en)}
                  </button>
                ) : (
                  <span>{item.kind === "clipper" ? t("Clé Monid requise pour lire les posts publics.", "Monid key required to read public posts.", en) : t("Connecte le compte pour lire ses vidéos.", "Connect the account to read its videos.", en)}</span>
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
            <div className="ss-acc__videos-head">
              <span className="ss-acc__muted">
                {data.videos.length
                  ? t(`Top ${data.videos.length} par vues · ${rangeLabel}`, `Top ${data.videos.length} by views · ${rangeLabel}`, en)
                  : t("Aucune vidéo sur cette période.", "No video in this range.", en)}
                {data.fetchedAt ? ` · ${t("lu le", "read on", en)} ${new Date(data.fetchedAt).toLocaleDateString(en ? "en-US" : "fr-FR")}` : ""}
              </span>
              {data.canFetch ? (
                <button type="button" className="ss-fan__chip" disabled={fetching} onClick={fetchVideos}>
                  {fetching ? t("Analyse…", "Analysing…", en) : data.videos.length ? t("Actualiser", "Refresh", en) : t("Analyser les vidéos", "Analyse the videos", en)}
                </button>
              ) : null}
            </div>
            <ol className="ss-acc__list">
              {data.videos.map((v, i) => (
                <li key={v.id}>
                  <span className="ss-acc__rank">{i + 1}</span>
                  {v.cover ? <img src={v.cover} alt="" loading="lazy" /> : <span className="ss-acc__thumb" />}
                  <div className="ss-acc__vtitle">
                    <b>{v.title || t("Sans titre", "Untitled", en)}</b>
                    <span>
                      {v.kind === "photo" ? t("Carrousel", "Carousel", en) : t("Vidéo", "Video", en)} · {dateOf(v.createdAt, en)}
                    </span>
                  </div>
                  <span className="ss-acc__num">
                    <b>{compact(v.views)}</b> {t("vues", "views", en)}
                  </span>
                  <span className="ss-acc__num">
                    <b>{compact(v.likes)}</b> likes
                  </span>
                  <span className="ss-acc__num">
                    <b>{compact(v.comments)}</b> {t("comm.", "comments", en)}
                  </span>
                  {v.url ? (
                    <a href={v.url} target="_blank" rel="noreferrer" className="ss-fan__chip">
                      ↗
                    </a>
                  ) : null}
                </li>
              ))}
            </ol>
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
