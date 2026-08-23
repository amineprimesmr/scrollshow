"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { useStudio } from "./StudioContext";

export function AnalyticsView() {
  const { posts, channels, activeChannel } = useStudio();
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
    { label: "Views", value: totals.views, color: "linear-gradient(135deg,#c4b5fd,#7c3aed)" },
    { label: "Recent Likes", value: totals.likes, color: "linear-gradient(135deg,#86efac,#16a34a)" },
    { label: "Recent Comments", value: totals.comments, color: "linear-gradient(135deg,#93c5fd,#2563eb)" },
    { label: "Recent Shares", value: totals.shares, color: "linear-gradient(135deg,#d8b4fe,#7c3aed)" },
  ];

  return (
    <div>
      {profile ? (
        <div className="ss-panel">
          <h2>
            {profile.display_name || profile.username} · user.info.basic / profile / stats
          </h2>
          <p>
            @{profile.username} · {Number(profile.follower_count || 0).toLocaleString()} followers ·{" "}
            {Number(profile.likes_count || 0).toLocaleString()} likes · {Number(profile.video_count || 0)} videos
          </p>
        </div>
      ) : null}
      <div className="ss-metrics">
      {cards.map((card) => (
        <article key={card.label} className="ss-metric">
          <span>• {card.label}</span>
          <div className="ss-swatch" style={{ background: card.color }} />
          <b>{card.value.toLocaleString("en-US")}</b>
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
                {Number(video.view_count || 0).toLocaleString()} · video.list
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

export function AgentView() {
  const { setPostOpen, setEditing } = useStudio();
  const [prompt, setPrompt] = useState("");
  const [out, setOut] = useState("");

  return (
    <div className="ss-panel">
      <h2>AI Agent</h2>
      <p>Génère une caption, puis envoie-la dans Create Post.</p>
      <div className="ss-form">
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Écris un carousel glow-up…" />
        <button
          className="ss-btn-purple"
          type="button"
          onClick={() => {
            const text = prompt.trim() || "glow up visage";
            const caption = `POV : tu copies le format qui fait ${text}. Hook en slide 1, preuve en slide 2, CTA App Store en slide 3. #debloat #glowup`;
            setOut(caption);
          }}
        >
          Generate
        </button>
        {out ? (
          <>
            <p>{out}</p>
            <button
              className="ss-btn-ghost"
              type="button"
              onClick={() => {
                setEditing({
                  id: "",
                  userId: "",
                  channelIds: [],
                  body: out,
                  date: new Date().toISOString().slice(0, 10),
                  time: "18:00",
                  status: "draft",
                  image: "/assets/tiktoks/01-glowup-188k.png",
                  views: 0,
                  likes: 0,
                  comments: 0,
                  shares: 0,
                });
                setPostOpen(true);
              }}
            >
              Schedule this
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function PlugsView() {
  const plugs = [
    { name: "Auto-like at 1k views", on: true },
    { name: "Auto-comment on first hour", on: false },
    { name: "Repost evergreen every 30 days", on: true },
  ];
  const [state, setState] = useState(plugs);
  return (
    <div className="ss-panel">
      <h2>Plugs</h2>
      <div className="ss-form">
        {state.map((plug, index) => (
          <label key={plug.name} className="ss-checks">
            <input
              type="checkbox"
              checked={plug.on}
              onChange={(event) => {
                setState((current) => current.map((item, i) => (i === index ? { ...item, on: event.target.checked } : item)));
              }}
            />
            {plug.name}
          </label>
        ))}
      </div>
    </div>
  );
}

export function IntegrationsView() {
  const { channels } = useStudio();
  const [english, setEnglish] = useState(false);
  const connected = channels.some((item) => item.connected);

  useEffect(() => {
    setEnglish(prefersEnglish());
  }, []);

  return (
    <div className="ss-panel">
      <h2>TikTok</h2>
      <p>
        Login Kit + Content Posting API — user.info.basic, user.info.profile, user.info.stats,
        video.list, video.upload, video.publish.
      </p>
      <div className="ss-form">
        <input readOnly value={connected ? t("TikTok connecté", "TikTok connected", english) : t("TikTok non connecté", "TikTok not connected", english)} />
        <a className="ss-btn-purple" href="/api/tiktok/oauth/start">
          {connected ? t("Reconnecter TikTok", "Reconnect TikTok", english) : t("Connecter TikTok", "Connect TikTok", english)}
        </a>
      </div>
    </div>
  );
}

export function UgcView() {
  const { media, setPostOpen, setEditing } = useStudio();
  return (
    <div className="ss-panel">
      <h2>UGC</h2>
      <p>Tes formats slideshow prêts à republier.</p>
      <div className="ss-media-grid">
        {media.slice(0, 6).map((item) => (
          <figure key={item.id}>
            <img src={item.url} alt="" />
            <figcaption>
              <button
                className="ss-btn-ghost"
                onClick={() => {
                  setEditing({
                    id: "",
                    userId: "",
                    channelIds: [],
                    body: item.name,
                    date: new Date().toISOString().slice(0, 10),
                    time: "12:00",
                    status: "draft",
                    image: item.url,
                    views: 0,
                    likes: 0,
                    comments: 0,
                    shares: 0,
                  });
                  setPostOpen(true);
                }}
              >
                Use in post
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

export function AffiliateView() {
  return (
    <div className="ss-panel">
      <h2>Affiliate</h2>
      <p>Partage ScrollShow, 30 % à vie sur chaque abonnement Pro.</p>
      <div className="ss-form">
        <input readOnly value="https://scrollshow.io/?ref=toi" />
        <button className="ss-btn-purple" type="button">
          Copier le lien
        </button>
      </div>
    </div>
  );
}

export function BillingView() {
  return (
    <div className="ss-panel">
      <h2>Billing</h2>
      <p>Free · 2 channels. Pro 29 €/mois · 30 channels, posts illimités.</p>
      <a className="ss-btn-purple" href="/pricing">
        Upgrade to Pro
      </a>
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
      <h2>{t("Réglages", "Settings", english)}</h2>
      <p>
        <strong>{user?.name}</strong>
        <br />
        {user?.email}
        <br />
        Plan {user?.plan === "pro" ? "Pro" : "Free"}
      </p>
      <h3>{t("Compte TikTok", "TikTok account", english)}</h3>
      {live.length ? (
        live.map((channel) => (
          <p key={channel.id}>
            @{channel.handle} · {channel.followers || 0} followers
          </p>
        ))
      ) : (
        <p>{t("Aucun compte connecté.", "No account connected.", english)}</p>
      )}
      <div className="ss-form-actions">
        <a className="ss-btn-purple" href="/api/tiktok/oauth/start">
          {t("Connecter TikTok", "Connect TikTok", english)}
        </a>
        {live.length ? (
          <button
            className="ss-btn-ghost"
            type="button"
            onClick={async () => {
              await fetch("/api/tiktok/disconnect", { method: "POST" });
              reload();
            }}
          >
            {t("Déconnecter", "Disconnect", english)}
          </button>
        ) : null}
      </div>
    </div>
  );
}
