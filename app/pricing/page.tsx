"use client";

import { BrandMark } from "@/components/BrandMark";
import { formatEuro, hasStudioAccess, PLAN, TRIAL_DAYS } from "@/lib/plans";
import { prefersEnglish, t } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import "./pricing.css";

export default function PricingPage() {
  const [english, setEnglish] = useState(false);
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState("");
  const [ready, setReady] = useState(false);
  const autoStart = useRef(false);

  useEffect(() => {
    setEnglish(prefersEnglish());
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : { user: null }))
      .then((json) => {
        setEmail(json.user?.email || "");
        setPlan(json.user?.plan || "");
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  async function checkout() {
    setPending(true);
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const json = await res.json().catch(() => ({}));
    setPending(false);
    if (res.status === 401) {
      window.location.href = `/signup?next=${encodeURIComponent("/pricing")}`;
      return;
    }
    if (json.url) {
      window.location.href = json.url;
      return;
    }
    alert(json.error || t("Paiement indisponible.", "Checkout is unavailable.", english));
  }

  useEffect(() => {
    if (!ready || autoStart.current || !email || hasStudioAccess(plan)) return;
    autoStart.current = true;
    void checkout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, email, plan]);

  return (
    <main className="ss-pricing">
      <nav className="ss-pricing__nav">
        <Link href="/">
          <BrandMark size={28} />
          ScrollShow
        </Link>
        <div className="ss-pricing__nav-meta">
          {email ? <span>{email}</span> : null}
          {hasStudioAccess(plan) ? (
            <Link href="/app">{t("Studio", "Studio", english)}</Link>
          ) : (
            <Link href={email ? "/pricing" : "/signup?mode=signin"}>
              {email ? t("Compte créé", "Account ready", english) : t("Connexion", "Log in", english)}
            </Link>
          )}
        </div>
      </nav>

      <header className="ss-pricing__hero">
        <h1>{t("Un seul plan. Accès complet.", "One plan. Full access.", english)}</h1>
        <p>
          {email && !hasStudioAccess(plan)
            ? t(
                "Ton compte est créé. Débloque le studio pour publier.",
                "Your account is ready. Unlock the studio to publish.",
                english,
              )
            : t(
                `Débloque ScrollShow. ${TRIAL_DAYS} jours d'essai offerts.`,
                `Unlock ScrollShow. ${TRIAL_DAYS}-day free trial.`,
                english,
              )}
        </p>
      </header>

      <section className="ss-pricing__grid ss-pricing__grid--single">
        <article className="ss-price-card is-popular">
          <div className="ss-price-card__name">{english ? PLAN.nameEn : PLAN.name}</div>
          <div className="ss-price-card__amount">
            <b>{formatEuro(PLAN.monthly)} €</b>
          </div>
          <div className="ss-price-card__cadence">{t("par mois", "per month", english)}</div>
          <ul className="ss-price-card__list">
            {(english ? PLAN.featuresEn : PLAN.featuresFr).map((feature) => (
              <li key={feature}>
                <i>✓</i>
                {feature}
              </li>
            ))}
          </ul>
          <button className="ss-price-card__cta" type="button" disabled={pending} onClick={() => void checkout()}>
            {pending ? "…" : t("Commencer pour 0€", "Start for €0", english)}
          </button>
        </article>
      </section>

      <p className="ss-pricing__foot">
        {t("Besoin d'aide ?", "Need help?", english)}{" "}
        <a href="mailto:hello@scrollshow.io">{t("Écris à hello@scrollshow.io", "Email hello@scrollshow.io", english)}</a>
      </p>
    </main>
  );
}
