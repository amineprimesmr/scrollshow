"use client";
import { BrandMark } from "@/components/BrandMark";
import { hasStudioAccess, PLAN } from "@/lib/plans";
import { afterAuthPath } from "@/lib/auth-urls";
import { prefersEnglish, t } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";
import "./pricing.css";

export default function PricingPage() {
  const [english, setEnglish] = useState(false);
  const [plan, setPlan] = useState("");
  const [destination, setDestination] = useState("/signup");
  useEffect(() => {
    setEnglish(prefersEnglish());
    fetch("/api/auth/me").then(r => r.json()).then(j => {
      setPlan(j.user?.plan || "");
      if (j.user) setDestination(j.user.emailVerified ? afterAuthPath(j.user.plan, null, j.user.onboarded) : "/signup?verify=1");
    }).catch(() => {});
  }, []);
  return <main className="ss-pricing">
    <nav className="ss-pricing__nav"><Link href="/"><BrandMark size={28} />ScrollShow</Link><Link href={hasStudioAccess(plan) ? "/app" : "/signup?mode=signin"}>{hasStudioAccess(plan) ? "Studio" : t("Connexion", "Log in", english)}</Link></nav>
    <header className="ss-pricing__hero"><h1>{t("Ton prochain carrousel commence ici.", "Your next carousel starts here.", english)}</h1><p>{t("Recherche, création, calendrier et MCP. Choisis ton accès.", "Research, creation, calendar and MCP. Choose your access.", english)}</p></header>
    <section className="ss-pricing__grid">
      {(["monthly", "lifetime"] as const).map(offer => <article key={offer} className={`ss-price-card ${offer === "lifetime" ? "is-popular" : ""}`}>
        <div className="ss-price-card__name">{offer === "monthly" ? t("Mensuel", "Monthly", english) : t("À vie", "Lifetime", english)}</div>
        <div className="ss-price-card__amount"><b>{(offer === "monthly" ? PLAN.monthly : PLAN.lifetime) / 100} €</b></div>
        <div className="ss-price-card__cadence">{offer === "monthly" ? t("par mois, sans engagement", "per month, cancel anytime", english) : t("une seule fois, sans renouvellement", "one payment, no renewal", english)}</div>
        <ul className="ss-price-card__list">{[
          t("Bibliothèque et analyse de comptes TikTok", "TikTok account library and analysis", english),
          t("Édition et duplication de carrousels", "Carousel editing and duplication", english),
          t("Calendrier et publication TikTok connecté", "Calendar and connected TikTok publishing", english),
          t("Outils MCP pour Claude, Cursor et Codex", "MCP tools for Claude, Cursor and Codex", english),
          offer === "monthly" ? t("Premier paiement à la souscription, puis chaque mois", "First payment on subscription, then monthly", english) : t("Accès au SaaS pendant la durée de son exploitation", "SaaS access for the operating lifetime of the service", english),
        ].map(f => <li key={f}><i>✓</i>{f}</li>)}</ul>
        {hasStudioAccess(plan) ? <Link className="ss-price-card__cta" href="/app">{t("Ouvrir mon studio", "Open my studio", english)}</Link> :
        <Link className="ss-price-card__cta" href={destination}>{t("Créer mon espace", "Create my workspace", english)}</Link>}
      </article>)}
    </section>
    <p className="ss-pricing__foot">{t("Inclus par jour : 30 analyses de comptes, 10 découvertes par mots-clés, 30 rendus et 20 exports. La recherche et la publication dépendent de la disponibilité des services et des autorisations TikTok.", "Daily allowance: 30 account analyses, 10 keyword discoveries, 30 renders and 20 exports. Research and publishing depend on service availability and TikTok permissions.", english)}</p>
    <p className="ss-pricing__foot">{t("Les limites des plateformes et les quotas de traitement s’appliquent aux deux offres. Les abonnements aux assistants IA ne sont pas inclus. Aucun résultat d’audience garanti.", "Platform limits and processing quotas apply to both offers. AI assistant subscriptions are not included. Audience results are not guaranteed.", english)} <a href="/terms">{t("Conditions", "Terms", english)}</a></p>
  </main>;
}
