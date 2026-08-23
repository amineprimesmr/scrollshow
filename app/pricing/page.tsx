"use client";

import { BrandMark } from "@/components/BrandMark";
import { formatEuro, PLANS, TRIAL_DAYS, type BillingInterval, type PaidPlan } from "@/lib/plans";
import { prefersEnglish, t } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";
import "./pricing.css";

const ORDER: PaidPlan[] = ["starter", "creator", "pro"];

export default function PricingPage() {
  const [english, setEnglish] = useState(false);
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [pending, setPending] = useState<string>("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    setEnglish(prefersEnglish());
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : { user: null }))
      .then((json) => setEmail(json.user?.email || ""))
      .catch(() => {});
  }, []);

  async function choose(plan: PaidPlan) {
    setPending(plan);
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, interval }),
    });
    const json = await res.json().catch(() => ({}));
    setPending("");
    if (res.status === 401) {
      window.location.href = `/login?next=${encodeURIComponent("/pricing")}`;
      return;
    }
    if (json.url) {
      window.location.href = json.url;
      return;
    }
    alert(json.error || t("Paiement indisponible.", "Checkout is unavailable.", english));
  }

  return (
    <main className="ss-pricing">
      <nav className="ss-pricing__nav">
        <Link href="/">
          <BrandMark size={28} />
          ScrollShow
        </Link>
        <div className="ss-pricing__nav-meta">
          {email ? <span>{email}</span> : null}
          <Link href={email ? "/app" : "/login"}>{email ? t("Studio", "Studio", english) : t("Connexion", "Log in", english)}</Link>
        </div>
      </nav>

      <header className="ss-pricing__hero">
        <h1>{t("Choisis ton plan", "Select plan", english)}</h1>
        <p>
          {t(
            `Débloque ScrollShow. ${TRIAL_DAYS} jours d’essai offerts sur chaque offre.`,
            `Unlock ScrollShow. ${TRIAL_DAYS}-day free trial on every plan.`,
            english,
          )}
        </p>
        <div className="ss-pricing__toggle">
          <button type="button" className={interval === "month" ? "is-on" : ""} onClick={() => setInterval("month")}>
            {t("MENSUEL", "MONTHLY", english)}
          </button>
          <button type="button" className={interval === "year" ? "is-on" : ""} onClick={() => setInterval("year")}>
            {t("ANNUEL", "YEARLY", english)}
            <span className="ss-pricing__save">{t("−20 %", "20% OFF", english)}</span>
          </button>
        </div>
      </header>

      <section className="ss-pricing__grid">
        {ORDER.map((id) => {
          const plan = PLANS[id];
          const amount = interval === "year" ? Math.round(plan.yearly / 12) : plan.monthly;
          return (
            <article key={id} className={`ss-price-card ${plan.popular ? "is-popular" : ""}`}>
              {plan.popular ? (
                <span className="ss-price-card__badge">{t(plan.badgeFr || "", plan.badgeEn || "", english)}</span>
              ) : null}
              <div className="ss-price-card__name">{english ? plan.nameEn : plan.name}</div>
              <div className="ss-price-card__amount">
                <b>{formatEuro(amount)} €</b>
                {interval === "year" ? (
                  <>
                    <span className="ss-price-card__old">{formatEuro(plan.monthly)} €</span>
                    <span className="ss-price-card__off">-20%</span>
                  </>
                ) : null}
              </div>
              <div className="ss-price-card__cadence">{t("par mois", "per month", english)}</div>
              <ul className="ss-price-card__list">
                {(english ? plan.featuresEn : plan.featuresFr).map((feature) => (
                  <li key={feature}>
                    <i>✓</i>
                    {feature}
                  </li>
                ))}
              </ul>
              <button className="ss-price-card__cta" type="button" disabled={pending === id} onClick={() => choose(id)}>
                {pending === id ? "…" : t("Choisir", "Choose", english)}
              </button>
            </article>
          );
        })}
      </section>

      <p className="ss-pricing__foot">
        {t("Besoin d’aide ?", "Need help?", english)}{" "}
        <a href="mailto:hello@scrollshow.io">{t("Écris à hello@scrollshow.io", "Email hello@scrollshow.io", english)}</a>
        {interval === "year" ? ` · ${t("Facturé une fois par an.", "Billed once a year.", english)}` : ""}
      </p>
    </main>
  );
}
