"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStudio } from "../StudioContext";

type MetricKey = "views" | "likes" | "comments" | "shares" | "posts";

type AnalyticsPayload = {
  connected: boolean;
  handle?: string;
  calendar: { views: number; likes: number; comments: number; shares: number; drafts: number; scheduled: number; published: number };
  totals: { views: number; likes: number; comments: number; shares: number };
  videos: Array<{ id: string; title?: string; video_description?: string; view_count?: number; like_count?: number; comment_count?: number; share_count?: number; cover_image_url?: string; share_url?: string }>;
  errors?: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function fmt(n: number, en: boolean) {
  return Math.round(n).toLocaleString(en ? "en-US" : "fr-FR");
}

function last30Days() {
  const days: string[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * DAY_MS);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values);
  const width = 200;
  const height = 40;
  const step = width / Math.max(values.length - 1, 1);
  const coords = values.map((v, i) => [i * step, height - (v / max) * (height - 4) - 2]);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const id = useMemo(() => `spark-${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <svg className="ss-an-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function BigChart({ values, days, color }: { values: number[]; days: string[]; color: string }) {
  const max = Math.max(1, ...values);
  const width = 760;
  const height = 180;
  const step = width / Math.max(values.length - 1, 1);
  const coords = values.map((v, i) => [i * step, height - (v / max) * (height - 20) - 10]);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const id = useMemo(() => `big-${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <svg className="ss-an-bigchart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  );
}

export function AnalyticsView() {
  const { posts, channels } = useStudio();
  const [english, setEnglish] = useState(false);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>("views");

  const connectedChannels = channels.filter((c) => c.connected);

  useEffect(() => setEnglish(prefersEnglish()), []);

  useEffect(() => {
    fetch("/api/studio/analytics")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        setAnalytics(json);
      })
      .catch((err) => {
        setAnalytics(null);
        setFetchError(err instanceof Error ? err.message : "unknown error");
      })
      .finally(() => setLoading(false));
  }, []);

  const days = useMemo(() => last30Days(), []);

  // Per-day breakdown is bucketed by each post's own publish date — the only
  // granularity ScrollShow actually stores. TikTok's API returns a live total
  // per video, not a daily history, so the headline numbers above use that
  // fresher source while this trend uses what's dated.
  const daily = useMemo(() => {
    const byDay = new Map(days.map((d) => [d, { views: 0, likes: 0, comments: 0, shares: 0, posts: 0 }]));
    for (const post of posts) {
      const bucket = byDay.get(post.date);
      if (!bucket) continue;
      bucket.views += post.views;
      bucket.likes += post.likes;
      bucket.comments += post.comments;
      bucket.shares += post.shares;
      bucket.posts += 1;
    }
    return days.map((d) => ({ date: d, ...byDay.get(d)! }));
  }, [days, posts]);

  const totals = analytics?.connected ? analytics.totals : analytics?.calendar || { views: 0, likes: 0, comments: 0, shares: 0 };
  const publishedCount = analytics?.calendar.published ?? posts.filter((p) => p.status === "published").length;
  const hasAnyData = Boolean(totals.views || totals.likes || totals.comments || totals.shares || publishedCount);

  const metrics: Array<{ key: MetricKey; label: string; hint: string; value: number; color: string; series: number[] }> = [
    {
      key: "views",
      label: t("Vues", "Views", english),
      hint: t("sur toutes tes vidéos", "across all your videos", english),
      value: totals.views,
      color: "#3b82f6",
      series: daily.map((d) => d.views),
    },
    {
      key: "likes",
      label: t("Likes", "Likes", english),
      hint: t("réactions positives", "positive reactions", english),
      value: totals.likes,
      color: "#ec4899",
      series: daily.map((d) => d.likes),
    },
    {
      key: "comments",
      label: t("Commentaires", "Comments", english),
      hint: t("conversations lancées", "conversations started", english),
      value: totals.comments,
      color: "#f59e0b",
      series: daily.map((d) => d.comments),
    },
    {
      key: "shares",
      label: t("Partages", "Shares", english),
      hint: t("relais organique", "organic reach", english),
      value: totals.shares,
      color: "#14b8a6",
      series: daily.map((d) => d.shares),
    },
    {
      key: "posts",
      label: t("Publiés", "Published", english),
      hint: t("posts sortis en 30 jours", "posts out in 30 days", english),
      value: daily.reduce((s, d) => s + d.posts, 0),
      color: "#8b5cf6",
      series: daily.map((d) => d.posts),
    },
  ];

  const activeMetric = metrics.find((m) => m.key === metric) || metrics[0];
  const axisStart = days[0]?.slice(5).split("-").reverse().join("/");
  const axisEnd = days[days.length - 1]?.slice(5).split("-").reverse().join("/");

  if (loading) {
    return <p className="ss-lead" style={{ padding: 24 }}>{t("Chargement…", "Loading…", english)}</p>;
  }

  if (!connectedChannels.length && !hasAnyData) {
    return (
      <div className="ss-empty">
        <h2>{t("Pas encore de stats", "No stats yet", english)}</h2>
        <p>{t("Connecte TikTok pour voir tes vues, likes et posts.", "Connect TikTok to see views, likes and posts.", english)}</p>
        <Link className="ss-btn-purple" href="/app/integrations">
          {t("Connecter TikTok", "Connect TikTok", english)}
        </Link>
      </div>
    );
  }

  return (
    <div className="ss-an">
      <div className="ss-analytics-head">
        <div>
          <h1>{t("Analytics", "Analytics", english)}</h1>
          <p>
            {analytics?.connected
              ? t(`Données en direct de @${analytics.handle}.`, `Live data from @${analytics.handle}.`, english)
              : t("Basé sur tes posts ScrollShow — connecte TikTok pour des chiffres en direct.", "Based on your ScrollShow posts — connect TikTok for live numbers.", english)}
          </p>
        </div>
      </div>

      {(fetchError || analytics?.errors?.length) ? (
        <div className="ss-an-card ss-an-card--pad" style={{ borderColor: "#f59e0b", color: "#b45309" }}>
          {fetchError
            ? t(`Erreur de chargement: ${fetchError}`, `Failed to load: ${fetchError}`, english)
            : analytics!.errors!.join(" · ")}
        </div>
      ) : null}

      <div className="ss-an-card">
        <div className="ss-an-metrics">
          {metrics.map((m) => (
            <button key={m.key} type="button" className={`ss-an-metric ${metric === m.key ? "is-active" : ""}`} onClick={() => setMetric(m.key)}>
              <span className="ss-an-metric__head" style={{ color: m.color }}>
                {m.label}
              </span>
              <span className="ss-an-metric__val">{fmt(m.value, english)}</span>
              <span className="ss-an-metric__hint">{m.hint}</span>
              <Sparkline values={m.series} color={m.color} />
            </button>
          ))}
        </div>
      </div>

      <div className="ss-an-card ss-an-card--pad">
        <div className="ss-an-card__head">
          <div>
            <span className="ss-an-card__label">{activeMetric.label}</span>
            <div className="ss-an-card__big">{fmt(activeMetric.value, english)}</div>
          </div>
        </div>
        <BigChart values={activeMetric.series} days={days} color={activeMetric.color} />
        <div className="ss-chart-axis">
          <span>{axisStart}</span>
          <span>{axisEnd}</span>
        </div>
      </div>

      <div className="ss-an-grid">
        <div className="ss-an-card ss-an-card--pad">
          <div className="ss-an-card__head">
            <h2>{t("Par compte", "By account", english)}</h2>
          </div>
          {channels.filter((c) => c.platform === "tiktok").length ? (
            <div className="ss-an-list">
              {channels
                .filter((c) => c.platform === "tiktok")
                .map((ch) => (
                  <div key={ch.id} className="ss-an-list__row">
                    <span>@{ch.handle}</span>
                    <b>{(ch.followers || 0).toLocaleString(english ? "en-US" : "fr-FR")}</b>
                    <small>{t("abonnés", "followers", english)}</small>
                  </div>
                ))}
            </div>
          ) : (
            <p className="ss-lead">{t("Aucun compte connecté.", "No account connected.", english)}</p>
          )}
        </div>

        <div className="ss-an-card ss-an-card--pad">
          <div className="ss-an-card__head">
            <h2>{t("Top vidéos", "Top videos", english)}</h2>
          </div>
          {analytics?.videos?.length ? (
            <div className="ss-an-list">
              {[...analytics.videos]
                .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
                .slice(0, 5)
                .map((v) => (
                  <a key={v.id} className="ss-an-list__row ss-an-list__row--link" href={v.share_url || undefined} target="_blank" rel="noreferrer">
                    <span className="ss-an-list__title">{(v.title || v.video_description || t("Sans titre", "Untitled", english)).slice(0, 48)}</span>
                    <b>{fmt(v.view_count || 0, english)}</b>
                    <small>{t("vues", "views", english)}</small>
                  </a>
                ))}
            </div>
          ) : (
            <p className="ss-lead">
              {analytics?.connected
                ? t("Pas encore de vidéos publiées.", "No published videos yet.", english)
                : t("Connecte TikTok pour voir tes vidéos.", "Connect TikTok to see your videos.", english)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
