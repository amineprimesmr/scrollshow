"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStudio } from "./StudioContext";

export function AnalyticsView() {
  const { posts, channels } = useStudio();
  const [english, setEnglish] = useState(false);
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");
  const [metric, setMetric] = useState<"views" | "likes" | "comments" | "posts">("views");
  const [videos, setVideos] = useState<any[]>([]);
  const connected = channels.some((item) => item.connected);
  const publishedPosts = posts.filter((post) => post.status === "published" || post.views > 0);
  const hasDemoStats = publishedPosts.length > 0 || posts.some((post) => post.views > 0);

  useEffect(() => setEnglish(prefersEnglish()), []);

  useEffect(() => {
    if (!connected) return;
    fetch("/api/tiktok/videos")
      .then((res) => res.json())
      .then((json) => setVideos(Array.isArray(json.videos) ? json.videos : []))
      .catch(() => undefined);
  }, [connected]);

  const totals = useMemo(() => {
    const source = publishedPosts.length ? publishedPosts : posts;
    return {
      views: source.reduce((s, p) => s + p.views, 0),
      likes: source.reduce((s, p) => s + p.likes, 0),
      comments: source.reduce((s, p) => s + p.comments, 0),
      posts: source.filter((p) => p.status === "published").length,
      website: 0,
    };
  }, [posts, publishedPosts]);

  const cards = [
    { label: t("Vues totales", "Total Views", english), value: totals.views, icon: "👁" },
    { label: t("Likes totaux", "Total Likes", english), value: totals.likes, icon: "♥" },
    { label: t("Commentaires", "Total Comments", english), value: totals.comments, icon: "💬" },
    { label: t("Posts", "Total Posts", english), value: totals.posts, icon: "📄" },
    { label: t("Vues site", "Website Views", english), value: totals.website, icon: "🌐" },
  ];

  if (!connected && !hasDemoStats) {
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

  const chartValue = metric === "views" ? totals.views : metric === "likes" ? totals.likes : metric === "comments" ? totals.comments : totals.posts;

  return (
    <div className="ss-analytics-dash">
      <div className="ss-analytics-head">
        <div>
          <h1>{t("Analytics", "Analytics", english)}</h1>
          <p>{t("Performance de ton contenu sur toutes les plateformes.", "Track your content performance across all platforms.", english)}</p>
        </div>
        <div className="ss-range-tabs">
          {(["7d", "30d", "90d"] as const).map((r) => (
            <button key={r} type="button" className={range === r ? "is-active" : ""} onClick={() => setRange(r)}>
              {r === "7d" ? "7 days" : r === "30d" ? "30 days" : "Quarter"}
            </button>
          ))}
        </div>
      </div>

      <div className="ss-stat-row">
        {cards.map((card) => (
          <div key={card.label} className="ss-stat-card">
            <span>{card.icon} {card.label}</span>
            <b>{card.value.toLocaleString(english ? "en-US" : "fr-FR")}</b>
          </div>
        ))}
      </div>

      <div className="ss-chart-card">
        <div className="ss-chart-card__head">
          <div>
            <h2>{t("Croissance cumulée", "Cumulative Growth", english)}</h2>
            <p>{t("Total accumulé sur les 30 derniers jours.", "Total accumulated over the last 30 days.", english)}</p>
          </div>
          <div className="ss-range-tabs">
            {(["views", "likes", "comments", "posts"] as const).map((m) => (
              <button key={m} type="button" className={metric === m ? "is-active" : ""} onClick={() => setMetric(m)}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {chartValue > 0 ? (
          <svg className="ss-chart-svg" viewBox="0 0 400 200" preserveAspectRatio="none">
            <polyline
              fill="none"
              stroke="#0a0a0a"
              strokeWidth="2"
              points="0,180 80,160 160,120 240,80 320,40 400,20"
            />
          </svg>
        ) : (
          <div className="ss-chart-empty">{t("Pas encore de données", "No data yet", english)}</div>
        )}
      </div>

      <div className="ss-chart-card">
        <div className="ss-chart-card__head">
          <div>
            <h2>{t("Croissance par jour", "Growth Per Day", english)}</h2>
            <p>{t("Performance quotidienne sur 30 jours.", "Daily performance over the last 30 days.", english)}</p>
          </div>
        </div>
        <div className="ss-chart-empty">{t("Pas encore de données", "No data yet", english)}</div>
      </div>

      <div className="ss-chart-card">
        <div className="ss-chart-card__head">
          <div>
            <h2>{t("Par compte", "By Account", english)}</h2>
            <p>{t("Engagement par compte, 30 derniers jours.", "Engagement per account, last 30 days.", english)}</p>
          </div>
        </div>
        {channels.length ? (
          <div>
            {channels.filter((c) => c.platform === "tiktok").map((ch) => (
              <div key={ch.id} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #ececec" }}>
                <span>@{ch.handle}</span>
                <span>{(ch.followers || 0).toLocaleString()} {t("abonnés", "followers", english)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="ss-chart-empty">{t("Aucune donnée compte", "No account data yet", english)}</div>
        )}
      </div>

      {videos.length || publishedPosts.length ? (
        <div className="ss-media-grid" style={{ marginTop: 16 }}>
          {(videos.length ? videos : publishedPosts).slice(0, 8).map((item: any) => (
            <figure key={item.id}>
              <img src={item.cover_image_url || item.image || "/assets/tiktoks/01-glowup-188k.png"} alt="" />
              <figcaption>{Number(item.view_count || item.views || 0).toLocaleString()} {t("vues", "views", english)}</figcaption>
            </figure>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function BillingView() {
  const { user } = useStudio();
  const [english, setEnglish] = useState(false);
  const [busy, setBusy] = useState(false);
  const plan = user?.plan || "free";

  useEffect(() => {
    setEnglish(prefersEnglish());
  }, []);

  async function openPortal() {
    setBusy(true);
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (json.url) window.location.href = json.url;
  }

  return (
    <div className="ss-panel">
      <h2>{t("Facturation", "Billing", english)}</h2>
      <p className="ss-lead">
        {t("Plan actuel :", "Current plan:", english)} <strong>{plan}</strong>
      </p>
      <button className="ss-btn-purple" type="button" disabled={busy} onClick={() => void openPortal()}>
        {t("Gérer l'abonnement", "Manage subscription", english)}
      </button>
    </div>
  );
}
