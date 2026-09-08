"use client";
import { useState } from "react";
import { PLAN } from "@/lib/plans";
import { t } from "@/lib/i18n";
import "./pricing-cards.css";

const iconPaths = [
  "M10 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm5-2 5 5",
  "M4 5h6l2 3h8v12H4V5Z M4 11h16",
  "m5 15 10-10 4 4L9 19l-5 1 1-5Z M13 7l4 4",
  "M9 9h11v11H9V9Z M15 5V3H3v12h2",
  "M5 5h14v15H5V5Z M8 3v4 M16 3v4 M5 10h14 M9 14h2 M9 17h5",
  "m8 7-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16",
  "M20 11a8 8 0 1 0-2 6 M20 5v6h-6 M12 8v5l3 2",
];

function FeatureIcon({ index }: { index: number }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={iconPaths[index]} /></svg>;
}

export function PricingCards({ english = false, destination = "/signup", hasAccess = false }: {
  english?: boolean; destination?: string; hasAccess?: boolean;
}) {
  const [busy, setBusy] = useState<"monthly" | "lifetime" | null>(null);
  const [error, setError] = useState<{ offer: "monthly" | "lifetime"; message: string } | null>(null);
  async function checkout(offer: "monthly" | "lifetime") {
    if (busy) return;
    setBusy(offer); setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offer, termsAccepted: true }) });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        const target = new URL(destination, window.location.origin);
        if (!target.searchParams.get("next")) target.searchParams.set("next", `/onboarding?step=payment&offer=${offer}`);
        window.location.assign(`${target.pathname}${target.search}`);
        return;
      }
      if (json.portal) { window.location.assign(json.portal); return; }
      if (!res.ok || !json.url) {
        const messages: Record<string, [string, string]> = {
          sales_not_open: ["La vente n\u2019est pas encore ouverte sur cet environnement.", "Sales are not open on this environment yet."],
          billing_not_configured: ["Le paiement n\u2019est pas configur\u00e9 sur cet environnement.", "Billing is not configured on this environment."],
          billing_price_mismatch: ["Le tarif Stripe ne correspond pas \u00e0 l\u2019offre affich\u00e9e. Contacte le support.", "The Stripe price does not match the displayed plan. Contact support."],
          preview_requires_test_stripe: ["Cet aper\u00e7u exige une cl\u00e9 Stripe de test.", "This preview requires a Stripe test key."],
          subscription_exists: ["Un abonnement existe d\u00e9j\u00e0 mais son paiement doit \u00eatre r\u00e9gularis\u00e9. Contacte le support.", "A subscription already exists but its payment needs attention. Contact support."],
        };
        const known = messages[json.error as string];
        setError({ offer, message: known ? t(known[0], known[1], english) : t("Impossible d\u2019ouvrir Stripe pour le moment. R\u00e9essaie dans un instant.", "Could not open Stripe right now. Please try again shortly.", english) });
        setBusy(null);
        return;
      }
      const url = new URL(json.url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") throw new Error("checkout_url");
      window.location.assign(url.href);
    } catch {
      setError({ offer, message: t("Impossible d\u2019ouvrir Stripe pour le moment. R\u00e9essaie dans un instant.", "Could not open Stripe right now. Please try again shortly.", english) });
      setBusy(null);
    }
  }
  const features = [
    t("Analyse de comptes TikTok", "TikTok account analysis", english),
    t("Bibliothèque de formats", "Slideshow format library", english),
    t("Création de carrousels", "Carousel creation", english),
    t("Duplication de slideshows", "Slideshow duplication", english),
    t("Calendrier et publication TikTok", "Calendar and TikTok publishing", english),
    t("Claude, Codex et Cursor via MCP", "Claude, Codex and Cursor via MCP", english),
    t("Sans renouvellement", "No renewal", english),
  ];
  return <div className="sc-prices">
    {(["monthly", "lifetime"] as const).map(offer => {
      const lifetime = offer === "lifetime";
      return <article key={offer} className={`sc-price${lifetime ? " sc-price--lifetime" : ""}`} aria-label={t(lifetime ? "Offre à vie" : "Offre mensuelle", lifetime ? "Lifetime plan" : "Monthly plan", english)}>
        <header className="sc-price__head">
          <div className="sc-price__top">
            <h3>{t(lifetime ? "Accès à vie" : "Accès mensuel", lifetime ? "Lifetime access" : "Monthly access", english)}</h3>
            {lifetime && <span className="sc-price__badge">{t("Paiement unique", "One payment", english)}</span>}
          </div>
          <div className="sc-price__pricing">
            <p className="sc-price__amount">{PLAN[offer] / 100} € <span>{t(lifetime ? "à vie" : "/ mois", lifetime ? "lifetime" : "/ month", english)}</span></p>
            <p className="sc-price__billing">{t(lifetime ? "Facturé 99 € une seule fois" : "Facturé 29 € chaque mois", lifetime ? "Billed €99 one time" : "Billed €29 every month", english)}<br />{t(lifetime ? "Sans renouvellement" : "Sans engagement", lifetime ? "No renewal" : "Cancel anytime", english)}</p>
          </div>
        </header>
        <ul className="sc-price__features">
          {features.map((feature, index) => {
            const locked = index === 6 && !lifetime;
            return <li key={feature}>
              <span className="sc-price__icon"><FeatureIcon index={index} /></span>
              <span className="sc-price__feature-label">{feature}</span>
              <span className={`sc-price__status${locked ? " is-locked" : ""}${lifetime && index < 6 ? " is-white" : ""}`}>
                <span className="sc-price__sr-only">{t(locked ? "Non inclus" : "Inclus", locked ? "Not included" : "Included", english)}</span>
                {locked ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="10" width="12" height="11" rx="2" fill="currentColor"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2"/></svg> : <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m4 12 5 5L20 6" stroke="currentColor" strokeWidth="3.5"/></svg>}
              </span>
            </li>;
          })}
        </ul>
        {hasAccess
          ? <a className="sc-price__cta" href="/app">{t("Ouvrir mon studio", "Open my studio", english)}</a>
          : <button type="button" className="sc-price__cta" disabled={busy !== null} onClick={() => void checkout(offer)} aria-label={t(lifetime ? "Choisir l\u2019acc\u00e8s \u00e0 vie \u00e0 99 \u20ac" : "Choisir l\u2019acc\u00e8s mensuel \u00e0 29 \u20ac", lifetime ? "Choose lifetime access for \u20ac99" : "Choose monthly access for \u20ac29", english)}>
              {busy === offer ? t("Ouverture de Stripe\u2026", "Opening Stripe\u2026", english) : t("Commencer", "Get started", english)}
            </button>}
        {error?.offer === offer && <p className="sc-price__error" role="alert">{error.message}</p>}
      </article>;
    })}
  </div>;
}
