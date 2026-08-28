"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useStudio } from "../StudioContext";

export function ContentView() {
  const { posts, english: ctxEnglish, setEditing, setPostOpen } = useStudio();
  const [english, setEnglish] = useState(false);
  const [filter, setFilter] = useState<"all" | "draft" | "scheduled" | "published">("all");

  useEffect(() => setEnglish(prefersEnglish()), []);
  const en = ctxEnglish || english;

  const filtered = posts.filter((p) => filter === "all" || p.status === filter);

  return (
    <div style={{ padding: "0 24px 48px" }}>
      <div className="ss-segment" style={{ marginBottom: 20 }}>
        {(["all", "draft", "scheduled", "published"] as const).map((f) => (
          <button key={f} type="button" className={filter === f ? "is-active" : ""} onClick={() => setFilter(f)}>
            {f === "all" ? t("Tout", "All", en) : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      <div className="ss-media-grid">
        {filtered.map((post) => (
          <figure key={post.id}>
            <button
              type="button"
              style={{ border: 0, padding: 0, background: "none", cursor: "pointer", width: "100%" }}
              onClick={() => {
                setEditing(post);
                setPostOpen(true);
              }}
            >
              <img src={post.image} alt="" />
            </button>
            <figcaption>
              {post.body.slice(0, 60) || t("Sans titre", "Untitled", en)}
              <br />
              <small>{post.status} · {post.views.toLocaleString()} {t("vues", "views", en)}</small>
            </figcaption>
          </figure>
        ))}
      </div>
      {!filtered.length ? (
        <div className="ss-empty">
          <p>{t("Aucun contenu.", "No content yet.", en)}</p>
          <Link href="/app/blitz" className="ss-btn-purple">{t("Ouvrir Blitz", "Open Blitz", en)}</Link>
        </div>
      ) : null}
    </div>
  );
}

export function LibraryInspirationView() {
  const [english, setEnglish] = useState(false);
  useEffect(() => setEnglish(prefersEnglish()), []);
  const en = english;
  return (
    <div className="ss-empty" style={{ margin: 24 }}>
      <h2>{t("Bibliothèque inspiration", "Inspiration Library", en)}</h2>
      <p>{t("Accès Pro — formats trending curés par niche, mis à jour chaque semaine.", "Pro access — trending formats curated by niche, updated weekly.", en)}</p>
      <Link href="/app/billing" className="ss-btn-purple">{t("Upgrade", "Upgrade", en)}</Link>
    </div>
  );
}

export function AiStudioView() {
  const [english, setEnglish] = useState(false);
  const [showOnboard, setShowOnboard] = useState(true);
  useEffect(() => setEnglish(prefersEnglish()), []);
  const en = english;

  return (
    <>
      {showOnboard ? (
        <div className="ss-onboard" role="dialog">
          <div className="ss-onboard-card">
            <h2>{t("C'est quoi AI Studio ?", "What is AI Studio?", en)}</h2>
            <p style={{ color: "#52525b", margin: "0 0 16px" }}>
              {t("AI Studio génère des assets uniques pour ton contenu.", "AI Studio is where you can generate unique assets to use in your content.", en)}
            </p>
            <div className="ss-onboard-grid">
              <div className="ss-onboard-box">
                <strong>{t("Images", "Images", en)}</strong>
                {t("Fonds pour slideshows — ex. parcours golf pour une app golf.", "Background images for slideshows — e.g. golf course for a golf app.", en)}
              </div>
              <div className="ss-onboard-box">
                <strong>{t("Vidéo", "Video", en)}</strong>
                {t("Vidéos one-off — ex. personne qui marche sur un parcours.", "One-off videos — e.g. person walking on a course.", en)}
              </div>
            </div>
            <p style={{ fontSize: 13, color: "#71717a" }}>
              {t("Pour un influenceur AI cohérent → page", "For a consistent AI influencer →", en)}{" "}
              <Link href="/app/influencers">{t("Influenceurs", "Influencers", en)}</Link>.
            </p>
            <button type="button" className="ss-btn-purple" style={{ float: "right" }} onClick={() => setShowOnboard(false)}>
              {t("Compris", "Got it", en)}
            </button>
          </div>
        </div>
      ) : null}
      <div style={{ padding: 24 }}>
        <div className="ss-panel">
          <h3>{t("Générer une image", "Generate an image", en)}</h3>
          <textarea className="ss-input" rows={3} placeholder={t("Décris l'image…", "Describe the image…", en)} style={{ width: "100%", marginBottom: 12 }} />
          <button type="button" className="ss-btn-purple">{t("Générer", "Generate", en)}</button>
        </div>
      </div>
    </>
  );
}

export function InfluencersView() {
  const [english, setEnglish] = useState(false);
  const [showOnboard, setShowOnboard] = useState(true);
  useEffect(() => setEnglish(prefersEnglish()), []);
  const en = english;

  return (
    <>
      {showOnboard ? (
        <div className="ss-onboard">
          <div className="ss-onboard-card">
            <h2>{t("Bienvenue dans Influenceurs", "Welcome to Influencers", en)}</h2>
            <div className="ss-onboard-grid" style={{ gridTemplateColumns: "1fr" }}>
              <div className="ss-onboard-box">
                <strong>{t("Crée un influenceur", "Create an influencer", en)}</strong>
                {t("Persona IA persistant — choisis les traits, on entraîne le personnage.", "AI persona you can generate content with. Pick traits and we'll train a persistent character.", en)}
              </div>
              <div className="ss-onboard-box">
                <strong>{t("Génère images et vidéos", "Generate images and videos", en)}</strong>
                {t("Prompt n'importe quelle image. Vidéos à partir d'une image existante.", "Prompt for any image. Videos from an existing image as base.", en)}
              </div>
            </div>
            <button type="button" className="ss-btn-purple" style={{ float: "right" }} onClick={() => setShowOnboard(false)}>
              {t("Compris", "Got it", en)}
            </button>
          </div>
        </div>
      ) : null}
      <div className="ss-empty" style={{ margin: 24 }}>
        <h2>{t("Aucun influenceur", "No influencers yet", en)}</h2>
        <p>{t("Crée ton premier persona IA pour du contenu cohérent.", "Create your first AI persona for consistent content.", en)}</p>
        <button type="button" className="ss-btn-purple">{t("+ Nouvel influenceur", "+ New influencer", en)}</button>
      </div>
    </>
  );
}

export function BrandView() {
  const [english, setEnglish] = useState(false);
  const [website, setWebsite] = useState("");
  useEffect(() => setEnglish(prefersEnglish()), []);
  const en = english;

  return (
    <div style={{ padding: 24, maxWidth: 560 }}>
      <div className="ss-panel">
        <h3>{t("Contexte marque", "Brand context", en)}</h3>
        <p className="ss-lead">{t("Utilisé par Automations et Blitz pour personnaliser le contenu.", "Used by Automations and Blitz to personalize content.", en)}</p>
        <label style={{ display: "block", marginTop: 16 }}>
          {t("Site web", "Website", en)}
          <input className="ss-input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" style={{ width: "100%", marginTop: 6 }} />
        </label>
        <button type="button" className="ss-btn-purple" style={{ marginTop: 16 }}>{t("Enregistrer", "Save", en)}</button>
      </div>
    </div>
  );
}

export function GuideView() {
  const [english, setEnglish] = useState(false);
  useEffect(() => setEnglish(prefersEnglish()), []);
  const en = english;
  return (
    <div className="ss-home" style={{ paddingTop: 24 }}>
      <section className="ss-faq">
        <h2>❓ {t("Guide & FAQ", "Guide & FAQ", en)}</h2>
        <p className="ss-lead">{t("Tout ce qu'il faut savoir pour lancer ScrollShow.", "Everything you need to know to run ScrollShow.", en)}</p>
      </section>
    </div>
  );
}

export function WarmedAccountsView() {
  const [english, setEnglish] = useState(false);
  useEffect(() => setEnglish(prefersEnglish()), []);
  const en = english;
  return (
    <div className="ss-empty" style={{ margin: 24 }}>
      <h2>{t("Comptes warmés", "Warmed Accounts", en)}</h2>
      <p>{t("Comptes TikTok/IG US/EU warmés sur vrais téléphones — à partir de 80€/mois.", "Real US/EU TikTok/IG accounts warmed on real phones — from $80/month.", en)}</p>
      <Link href="/app/billing" className="ss-btn-purple">{t("Upgrade", "Upgrade", en)}</Link>
    </div>
  );
}

export function AffiliateView() {
  const [english, setEnglish] = useState(false);
  useEffect(() => setEnglish(prefersEnglish()), []);
  const en = english;
  return (
    <div className="ss-empty" style={{ margin: 24 }}>
      <h2>{t("Parrainer & gagner", "Refer & Earn", en)}</h2>
      <p>{t("20% de commission récurrente sur chaque filleul.", "20% recurring commission on every referral.", en)}</p>
    </div>
  );
}
