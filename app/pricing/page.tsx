"use client";

import { BrandMark } from "@/components/BrandMark";
import { formatEuro, hasStudioAccess, isPaidPlan, PLANS, TRIAL_DAYS, yearlyOffer, type BillingInterval, type PaidPlan } from "@/lib/plans";
import { prefersEnglish, t } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import "./pricing.css";

const ORDER: PaidPlan[] = ["starter", "creator", "pro"];

export default function PricingPage() {
  const [english, setEnglish] = useState(false);
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [pending, setPending] = useState<string>("");
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState("");
  const [ready, setReady] = useState(false);
  const [upsell, setUpsell] = useState<PaidPlan | null>(null);
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

  useEffect(() => {
    if (!upsell) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setUpsell(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [upsell]);

  async function checkout(plan: PaidPlan, nextInterval: BillingInterval) {
    setPending(`${plan}-${nextInterval}`);
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, interval: nextInterval }),
    });
    const json = await res.json().catch(() => ({}));
    setPending("");
    if (res.status === 401) {
      const next = `/pricing?plan=${plan}&interval=${nextInterval}`;
      window.location.href = `/signup?next=${encodeURIComponent(next)}`;
      return;
    }
    if (json.url) {
      window.location.href = json.url;
      return;
    }
    alert(json.error || t("Paiement indisponible.", "Checkout is unavailable.", english));
  }

  function choose(plan: PaidPlan) {
    if (interval === "month") {
      setUpsell(plan);
      return;
    }
    void checkout(plan, "year");
  }

  useEffect(() => {
    if (!ready || autoStart.current || !email || hasStudioAccess(plan)) return;
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("plan") || "";
    if (!isPaidPlan(wanted)) return;
    autoStart.current = true;
    const nextInterval: BillingInterval = params.get("interval") === "year" ? "year" : "month";
    void checkout(wanted, nextInterval);
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
        <h1>{t("Choisis un abonnement après ton essai offert de 3 jours", "Choose a plan after your 3-day free trial", english)}</h1>
        <p>
          {email && !hasStudioAccess(plan)
            ? t(
                "Ton compte est créé. Choisis un plan pour ouvrir le studio.",
                "Your account is ready. Choose a plan to open the studio.",
                english,
              )
            : t(
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
              <button className="ss-price-card__cta" type="button" disabled={pending.startsWith(id)} onClick={() => choose(id)}>
                {pending.startsWith(id) ? "…" : t("Commencer pour 0€", "Start for €0", english)}
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

      {upsell ? <AnnualUpsell plan={upsell} english={english} pending={pending} onClose={() => setUpsell(null)} onChoose={checkout} /> : null}
    </main>
  );
}

function AnnualUpsell({
  plan,
  english,
  pending,
  onClose,
  onChoose,
}: {
  plan: PaidPlan;
  english: boolean;
  pending: string;
  onClose: () => void;
  onChoose: (plan: PaidPlan, interval: BillingInterval) => void;
}) {
  const item = PLANS[plan];
  const offer = yearlyOffer(plan);
  const name = english ? item.nameEn : item.name;
  const busyYear = pending === `${plan}-year`;
  const busyMonth = pending === `${plan}-month`;

  return (
    <div className="ss-upsell" role="presentation" onClick={onClose}>
      <div
        className="ss-upsell__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ss-upsell-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="ss-upsell__close" type="button" onClick={onClose} aria-label={t("Fermer", "Close", english)}>
          ×
        </button>
        <span className="ss-upsell__badge">{t("2+ mois offerts", "2+ months free", english)}</span>
        <h2 id="ss-upsell-title" className="ss-upsell__title">
          {t("Prends toute l’année, aujourd’hui.", "Get your whole year of ScrollShow, today.", english)}
        </h2>
        <p className="ss-upsell__lead">
          {t("Passe ", "Switch ", english)}
          <b>{name}</b>
          {t(" en annuel avant de payer.", " to annual before you check out.", english)}
        </p>

        <ul className="ss-upsell__list">
          <li>
            <i aria-hidden>✓</i>
            <span>
              {t(
                "Toute l’année tout de suite. Les 12 mois sont activés dès l’upgrade, pas mois par mois.",
                "Your full year, upfront. All 12 months are added the moment you upgrade, rather than released month by month.",
                english,
              )}
            </span>
          </li>
          <li>
            <i aria-hidden>✓</i>
            <span>
              {t(
                `2+ mois offerts : ${formatEuro(offer.perMonth)} €/mois au lieu de ${formatEuro(item.monthly)} € × 12.`,
                `Get 2+ months free: ${formatEuro(offer.perMonth)} €/mo instead of ${formatEuro(item.monthly)} € × 12.`,
                english,
              )}
            </span>
          </li>
          <li>
            <i aria-hidden>✓</i>
            <span>
              {t(
                "Un seul paiement pour l’année. Pas de prélèvement mensuel, pas d’interruption.",
                "One payment for the year. No monthly charges, no payment interruptions.",
                english,
              )}
            </span>
          </li>
        </ul>

        <div className="ss-upsell__compare">
          <div>
            <small>{t("Mensuel", "Monthly", english)}</small>
            <b>{formatEuro(item.monthly)} €</b>
            <span>{t("/mois", "/mo", english)}</span>
            <em>
              {formatEuro(offer.billedIfMonthly)} €{t("/an", "/year", english)}
            </em>
          </div>
          <i aria-hidden>→</i>
          <div className="is-win">
            <small>{t("Annuel", "Annual", english)}</small>
            <b>{formatEuro(offer.perMonth)} €</b>
            <span>{t("/mois", "/mo", english)}</span>
            <em>
              {formatEuro(offer.yearly)} €{t("/an", "/year", english)}
            </em>
          </div>
        </div>

        <div className="ss-upsell__deal">
          <div className="ss-upsell__deal-row">
            <small>{t("Annuel", "Annual", english)}</small>
            <b className="ss-upsell__save">
              {t("Économise", "Save", english)} {formatEuro(offer.save)} €
            </b>
          </div>
          <div className="ss-upsell__prices">
            <s>{formatEuro(offer.billedIfMonthly)} €</s>
            <strong>{formatEuro(offer.yearly)} €</strong>
            <em>{t("/an", "/year", english)}</em>
          </div>
          <p>
            {t("soit", "about", english)} <b>{formatEuro(offer.perMonth)} €{t("/mois", "/mo", english)}</b>
            {" — "}
            {t("environ", "about", english)} {formatEuro(offer.perDay)} €{t("/jour", "/day", english)}
            {" — "}
            {t("facturé une fois par an", "billed once a year", english)}
          </p>
        </div>

        <button className="ss-upsell__primary" type="button" disabled={Boolean(pending)} onClick={() => onChoose(plan, "year")}>
          {busyYear ? "…" : t("Passer à l’annuel et économiser 20 %", "Go annual and save 20%", english)}
        </button>
        <button className="ss-upsell__secondary" type="button" disabled={Boolean(pending)} onClick={() => onChoose(plan, "month")}>
          {busyMonth ? "…" : t("Continuer en mensuel", "Continue with monthly billing", english)}
        </button>
        <p className="ss-upsell__note">
          {t("Ce tarif annuel n’est disponible qu’ici, au checkout.", "This annual price is only available here, at checkout.", english)}
        </p>
      </div>
    </div>
  );
}
