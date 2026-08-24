"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import { familyConfigured, PLATFORMS, platformName, type PlatformAvailability } from "@/lib/platforms";
import { useEffect, useMemo, useState } from "react";
import { DeveloperAccess } from "./DeveloperAccess";
import { useStudio } from "./StudioContext";

export function AnalyticsView() {
  const { posts, channels, activeChannel } = useStudio();
  const [english, setEnglish] = useState(false);
  const [profile, setProfile] = useState<Record<string, any> | null>(null);
  const [videos, setVideos] = useState<any[]>([]);
  const visible = posts.filter((post) => activeChannel === "all" || post.channelIds.includes(activeChannel));
  const connected = channels.some((item) => item.connected);
  const totals = useMemo(() => {
    if (videos.length) {
      return videos.reduce(
        (sum, video) => ({
          views: sum.views + Number(video.view_count || 0),
          likes: sum.likes + Number(video.like_count || 0),
          comments: sum.comments + Number(video.comment_count || 0),
          shares: sum.shares + Number(video.share_count || 0),
        }),
        { views: 0, likes: 0, comments: 0, shares: 0 },
      );
    }
    return {
      views: visible.reduce((sum, post) => sum + post.views, 0),
      likes: visible.reduce((sum, post) => sum + post.likes, 0),
      comments: visible.reduce((sum, post) => sum + post.comments, 0),
      shares: visible.reduce((sum, post) => sum + post.shares, 0),
    };
  }, [visible, videos]);

  useEffect(() => {
    setEnglish(prefersEnglish());
  }, []);

  useEffect(() => {
    if (!connected) return;
    fetch("/api/tiktok/me")
      .then((res) => res.json())
      .then((json) => setProfile(json.user || null))
      .catch(() => undefined);
    fetch("/api/tiktok/videos")
      .then((res) => res.json())
      .then((json) => setVideos(Array.isArray(json.videos) ? json.videos : []))
      .catch(() => undefined);
  }, [connected]);

  const cards = [
    { label: t("Vues", "Views", english), value: totals.views },
    { label: t("Likes", "Likes", english), value: totals.likes },
    { label: t("Commentaires", "Comments", english), value: totals.comments },
    { label: t("Partages", "Shares", english), value: totals.shares },
  ];

  if (!connected) {
    return (
      <div className="ss-empty">
        <h2>{t("Pas encore de stats", "No stats yet", english)}</h2>
        <p>{t("Connecte TikTok pour voir tes vues, likes et posts.", "Connect TikTok to see views, likes and posts.", english)}</p>
        <a className="ss-btn-purple" href="/app/integrations">
          {t("Connecter TikTok", "Connect TikTok", english)}
        </a>
      </div>
    );
  }

  return (
    <div>
      {profile ? (
        <div className="ss-panel ss-profile">
          <h2>{profile.display_name || profile.username}</h2>
          <p>
            @{profile.username}
            {profile.follower_count != null ? ` · ${Number(profile.follower_count).toLocaleString()} ${t("abonnés", "followers", english)}` : ""}
          </p>
        </div>
      ) : null}
      <div className="ss-metrics">
        {cards.map((card) => (
          <article key={card.label} className="ss-metric">
            <span>{card.label}</span>
            <b>{card.value.toLocaleString(english ? "en-US" : "fr-FR")}</b>
          </article>
        ))}
      </div>
      {videos.length ? (
        <div className="ss-media-grid">
          {videos.map((video) => (
            <figure key={video.id}>
              <img src={video.cover_image_url || "/assets/tiktoks/01-glowup-188k.png"} alt="" />
              <figcaption>
                {video.title || video.video_description || video.id}
                <br />
                {Number(video.view_count || 0).toLocaleString(english ? "en-US" : "fr-FR")} {t("vues", "views", english)}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MediaView() {
  const { media } = useStudio();
  const [english, setEnglish] = useState(false);

  useEffect(() => {
    setEnglish(prefersEnglish());
  }, []);

  if (!media.length) {
    return (
      <div className="ss-empty">
        <h2>{t("Aucun média", "No media", english)}</h2>
        <p>{t("Tes slides de carrousel apparaîtront ici.", "Your carousel slides will show up here.", english)}</p>
      </div>
    );
  }

  return (
    <div className="ss-media-grid">
      {media.map((item) => (
        <figure key={item.id}>
          <img src={item.url} alt="" />
          <figcaption>{item.name}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export function IntegrationsView({ availability }: { availability: PlatformAvailability }) {
  const { channels } = useStudio();
  const [english, setEnglish] = useState(false);

  useEffect(() => {
    setEnglish(prefersEnglish());
  }, []);

  return (
    <>
      <div className="ss-network-grid">
        {PLATFORMS.map((platform) => {
          const connected = channels.some((item) => item.platform === platform.id && item.connected);
          const configured = familyConfigured(platform.family, availability);
          const coming = !configured && platform.id !== "tiktok";
          const badge = connected
            ? t("Connecté", "Connected", english)
            : platform.lifecycle === "pending_review"
              ? t("Sandbox", "Sandbox", english)
              : configured
                ? t("Prêt", "Ready", english)
                : t("Bientôt", "Soon", english);
          const badgeClass = connected ? "is-ready" : configured || platform.id === "tiktok" ? "is-review" : "is-wait";
          return (
            <article key={platform.id} className="ss-network-card">
              <header>
                <img
                  src={platform.logo}
                  alt=""
                  width={36}
                  height={36}
                  className={platform.id === "x" ? "ss-platform-logo is-x" : "ss-platform-logo"}
                />
                <div>
                  <h2>{platform.name}</h2>
                  <span className={`ss-badge ${badgeClass}`}>{badge}</span>
                </div>
              </header>
              <p>
                {platform.family === "tiktok"
                  ? t("Connecte le compte, puis publie tes carrousels photo.", "Connect the account, then publish photo carousels.", english)
                  : coming
                    ? t("On branche cette plateforme ensuite. TikTok d’abord.", "This platform comes next. TikTok first.", english)
                    : t("Connecte le compte pour publier depuis le calendrier.", "Connect the account to publish from the calendar.", english)}
              </p>
              {coming ? (
                <button className="ss-btn-ghost" type="button" disabled>
                  {t("Bientôt", "Soon", english)}
                </button>
              ) : (
                <a className="ss-btn-purple" href={platform.connectPath}>
                  {connected
                    ? t(`Reconnecter`, `Reconnect`, english)
                    : t(`Connecter`, `Connect`, english)}
                </a>
              )}
            </article>
          );
        })}
      </div>
      <DeveloperAccess />
    </>
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
    else window.location.href = "/pricing";
  }

  return (
    <div className="ss-panel">
      <h2>{t("Abonnement", "Subscription", english)}</h2>
      <p>
        {t("Plan actuel", "Current plan", english)} : <b>{plan === "free" ? "Free" : plan}</b>
      </p>
      <div className="ss-form-actions">
        <a className="ss-btn-purple" href="/pricing">
          {t("Voir les tarifs", "See plans", english)}
        </a>
        {plan !== "free" ? (
          <button className="ss-btn-ghost" type="button" disabled={busy} onClick={openPortal}>
            {busy ? "…" : t("Gérer l’abonnement", "Manage subscription", english)}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function SettingsView() {
  const { user, channels, reload } = useStudio();
  const [english, setEnglish] = useState(false);
  const live = channels.filter((item) => item.connected);

  useEffect(() => {
    setEnglish(prefersEnglish());
  }, []);

  return (
    <div className="ss-panel">
      <h2>{t("Compte", "Account", english)}</h2>
      <p>
        <strong>{user?.name}</strong>
        <br />
        {user?.email}
        <br />
        {user?.plan && user.plan !== "free" ? `Plan ${user.plan}` : t("Aucun plan", "No plan", english)}
      </p>
      <h3>{t("Comptes connectés", "Connected accounts", english)}</h3>
      {live.length ? (
        live.map((channel) => (
          <p key={channel.id}>
            {platformName(channel.platform)} · @{channel.handle}
            {channel.followers ? ` · ${channel.followers} ${t("abonnés", "followers", english)}` : ""}
          </p>
        ))
      ) : (
        <p>{t("Aucun compte connecté.", "No account connected.", english)}</p>
      )}
      <div className="ss-form-actions">
        <a className="ss-btn-purple" href="/app/integrations">
          {t("Gérer les connexions", "Manage connections", english)}
        </a>
        {live.length ? (
          <button
            className="ss-btn-ghost"
            type="button"
            onClick={async () => {
              await Promise.all(live.map((channel) => fetch(`/api/studio/channels/${channel.id}`, { method: "DELETE" })));
              await fetch("/api/tiktok/disconnect", { method: "POST" });
              reload();
            }}
          >
            {t("Tout déconnecter", "Disconnect all", english)}
          </button>
        ) : null}
      </div>
    </div>
  );
}
