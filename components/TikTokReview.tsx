"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";
import "@/app/review/review.css";

const SCOPES = [
  "user.info.basic",
  "user.info.profile",
  "user.info.stats",
  "video.list",
  "video.upload",
  "video.publish",
];

const VIDEOS = [
  { id: "1", title: "Glow-up protocol", src: "/assets/tiktoks/01-glowup-188k.png", views: 188000 },
  { id: "2", title: "Foods that bloat", src: "/assets/tiktoks/02-foods-107k.png", views: 107000 },
  { id: "3", title: "Debloat guide", src: "/assets/tiktoks/03-guide-178k.png", views: 178000 },
  { id: "4", title: "Water retention POV", src: "/assets/tiktoks/07-pov-98k.png", views: 98000 },
];

export function TikTokReview() {
  const [english, setEnglish] = useState(false);
  const [caption, setCaption] = useState("Glow-up protocol — copy the format, post the carousel.");
  const [privacy, setPrivacy] = useState("SELF_ONLY");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setEnglish(prefersEnglish());
  }, []);

  return (
    <main className="ss-review">
      <header className="ss-review__bar">
        <Link href="/" className="ss-review__brand">
          <img src="/logo.svg" alt="ScrollShow" />
          ScrollShow
        </Link>
        <span>{t("Démo review TikTok (sans login)", "TikTok review demo (no login)", english)}</span>
      </header>
      <p className="ss-review__banner">
        {t(
          "Mockup public du vrai /app. Produits : Login Kit + Content Posting API. Scopes démontrés : ",
          "Public mockup of live /app. Products: Login Kit + Content Posting API. Scopes shown: ",
          english,
        )}
        {SCOPES.join(", ")}.
      </p>
      <div className="ss-review__grid">
        <aside className="ss-review__card">
          <h2>user.info.basic / profile</h2>
          <div className="ss-review__profile">
            <img src="/assets/avatars/gars1.png" alt="" />
            <div>
              <b>ScrollShow Demo</b>
              <div>@scrollshow</div>
            </div>
          </div>
          <div className="ss-review__stats">
            {[
              ["128.4k", "followers"],
              ["2.4M", "likes"],
              ["86", "videos"],
              ["42", "following"],
            ].map(([value, label]) => (
              <div key={label}>
                <b>{value}</b>
                <span>
                  {label} · user.info.stats
                </span>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 16 }}>
            <a className="ss-review__cta" href="/api/tiktok/oauth/start">
              {t("Continuer avec TikTok", "Continue with TikTok", english)}
            </a>
          </p>
        </aside>
        <section className="ss-review__card">
          <h2>video.list</h2>
          <div className="ss-review__videos">
            {VIDEOS.map((video) => (
              <figure key={video.id}>
                <img src={video.src} alt="" />
                <figcaption>
                  {video.title}
                  <br />
                  {video.views.toLocaleString()} views
                </figcaption>
              </figure>
            ))}
          </div>
          <h2 style={{ marginTop: 22 }}>video.upload / video.publish</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setDone(true);
            }}
          >
            <textarea value={caption} onChange={(event) => setCaption(event.target.value)} />
            <select value={privacy} onChange={(event) => setPrivacy(event.target.value)}>
              <option value="PUBLIC_TO_EVERYONE">{t("Tout le monde", "Everyone", english)}</option>
              <option value="MUTUAL_FOLLOW_FRIENDS">{t("Amis", "Friends", english)}</option>
              <option value="FOLLOWER_OF_CREATOR">{t("Abonnés", "Followers", english)}</option>
              <option value="SELF_ONLY">{t("Moi uniquement", "Only me", english)}</option>
            </select>
            <button type="submit">{t("Publier le carrousel (Direct Post)", "Publish carousel (Direct Post)", english)}</button>
            {done ? (
              <p className="ss-review__ok">
                {t(
                  "Statut : PUBLISH_COMPLETE — carrousel envoyé via video.publish / video.upload (démo review).",
                  "Status: PUBLISH_COMPLETE — carousel sent via video.publish / video.upload (review demo).",
                  english,
                )}
              </p>
            ) : null}
          </form>
        </section>
      </div>
    </main>
  );
}
