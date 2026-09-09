"use client";
import { useState } from "react";
import { PLAN, visibleOffers, type Offer } from "@/lib/plans";
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
  const [busy, setBusy] = useState<Offer | null>(null);
  const [error, setError] = useState<{ offer: Offer; message: string } | null>(null);
  async function checkout(offer: Offer) {
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
  /** Libelles par offre : un seul endroit ou lire ce que la carte annonce. */
  const copy: Record<Offer, {
    aria: string; title: string; amount: string; unit: string; billed: string; commitment: string;
    badge?: string; ribbon?: string; ribbonNote?: string; cta: string;
  }> = {
    monthly: {
      aria: t("Offre mensuelle", "Monthly plan", english),
      title: t("Accès mensuel", "Monthly access", english),
      amount: `${PLAN.monthly / 100} €`,
      unit: t("/ mois", "/ month", english),
      billed: t("Facturé 29 € chaque mois", "Billed €29 every month", english),
      commitment: t("Sans engagement", "Cancel anytime", english),
      cta: t("Choisir l’accès mensuel à 29 €", "Choose monthly access for €29", english),
    },
    yearly: {
      aria: t("Offre annuelle", "Yearly plan", english),
      title: t("Accès annuel", "Yearly access", english),
      amount: `${PLAN.yearly / 100} €`,
      unit: t("/ an", "/ year", english),
      billed: t("Facturé 199 € chaque année", "Billed €199 every year", english),
      commitment: t("Soit 16,58 € par mois", "That is €16.58 per month", english),
      badge: t("Économise 149 €", "Save €149", english),
      cta: t("Choisir l’accès annuel à 199 €", "Choose yearly access for €199", english),
    },
    lifetime: {
      aria: t("Offre à vie", "Lifetime plan", english),
      title: t("Accès à vie", "Lifetime access", english),
      amount: `${PLAN.lifetime / 100} €`,
      unit: t("à vie", "lifetime", english),
      billed: t("Facturé 99 € une seule fois", "Billed €99 one time", english),
      commitment: t("Sans renouvellement", "No renewal", english),
      badge: t("Paiement unique", "One payment", english),
      ribbon: t("Offre de lancement", "Launch offer", english),
      ribbonNote: t("Durée limitée", "Limited time", english),
      cta: t("Choisir l’accès à vie à 99 €", "Choose lifetime access for €99", english),
    },
  };
  return <div className="sc-prices">
    {visibleOffers().map(offer => {
      const lifetime = offer === "lifetime";
      const text = copy[offer];
      return <article key={offer} className={`sc-price${lifetime ? " sc-price--lifetime" : ""}${text.ribbon ? " sc-price--ribboned" : ""}`} aria-label={text.aria}>
        {text.ribbon && (
          <p className="sc-price__ribbon">
            <b>{text.ribbon}</b>
            {text.ribbonNote && <i>{text.ribbonNote}</i>}
          </p>
        )}
        <header className="sc-price__head">
          <div className="sc-price__top">
            <h3>{text.title}</h3>
            {text.badge && <span className="sc-price__badge">{text.badge}</span>}
          </div>
          <div className="sc-price__pricing">
            <p className="sc-price__amount">{text.amount} <span>{text.unit}</span></p>
            <p className="sc-price__billing">{text.billed}<br />{text.commitment}</p>
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
          : <button type="button" className="sc-price__cta" disabled={busy !== null} onClick={() => void checkout(offer)} aria-label={text.cta}>
              {busy === offer ? t("Ouverture de Stripe\u2026", "Opening Stripe\u2026", english) : t("Commencer", "Get started", english)}
            </button>}
        {error?.offer === offer && <p className="sc-price__error" role="alert">{error.message}</p>}
      </article>;
    })}
  </div>;
}
