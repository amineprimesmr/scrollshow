"use client";
import { useState } from "react";
import { PLAN } from "@/lib/plans";

export function OnboardingPayment({ english, initialOffer = "monthly", canceled = false, pendingPayment = false }: { english: boolean; initialOffer?: "monthly" | "lifetime"; canceled?: boolean; pendingPayment?: boolean }) {
  const [offer, setOffer] = useState(initialOffer);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = (fr: string, en: string) => english ? en : fr;
  async function pay() {
    if (!accepted || busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offer, termsAccepted: true }) });
      const json = await res.json();
      if (res.status === 401) { window.location.assign("/signup?mode=signin&next=/onboarding"); return; }
      if (json.portal) { window.location.assign(json.portal); return; }
      if (json.error === "subscription_exists") { setError(t("Un abonnement existe déjà, mais son paiement doit être régularisé. Contacte aminennasri@outlook.com : aucun nouvel abonnement ne sera créé.", "A subscription already exists, but its payment needs attention. Contact aminennasri@outlook.com: no new subscription will be created.")); setBusy(false); return; }
      if (!res.ok || !json.url) throw new Error("checkout");
      const destination = new URL(json.url);
      if (destination.protocol !== "https:" || destination.hostname !== "checkout.stripe.com") throw new Error("checkout_url");
      window.location.assign(destination.href);
    } catch { setError(t("Impossible d’ouvrir Stripe. Ton espace est enregistré : réessaie dans un instant.", "Could not open Stripe. Your workspace is saved: please try again shortly.")); setBusy(false); }
  }
  return <div className="ss-onb-form">
    <p>{t("Ton espace est préparé. Choisis ton accès pour commencer à utiliser ScrollShow.", "Your workspace is ready. Choose your access to start using ScrollShow.")}</p>
    {canceled && <p role="status">{t("Paiement interrompu. Tes informations sont conservées, tu peux reprendre ici.", "Checkout canceled. Your details are saved; you can resume here.")}</p>}
    {pendingPayment && <p role="status">{t("Le paiement n’est pas encore confirmé. Si tu as été débité, ne paie pas une seconde fois : attends la confirmation ou contacte le support.", "Payment is not confirmed yet. If you were charged, do not pay again: wait for confirmation or contact support.")} <a href="mailto:aminennasri@outlook.com">Support</a></p>}
    <fieldset disabled={busy} className="ss-onb-offers"><legend>{t("Choisis ton offre", "Choose your plan")}</legend>
      {(["monthly", "lifetime"] as const).map(value => <label key={value} className={`ss-onb-offer ${offer === value ? "is-selected" : ""}`}><input type="radio" name="offer" value={value} checked={offer === value} onChange={() => setOffer(value)} />
        <span><strong>{value === "monthly" ? `${PLAN.monthly / 100} € / ${t("mois", "month")}` : `${PLAN.lifetime / 100} € ${t("à vie", "lifetime")}`}</strong><small>{value === "monthly" ? t("Premier paiement maintenant, puis chaque mois. Résiliable à tout moment.", "First payment now, then monthly. Cancel anytime.") : t("Un seul paiement, sans renouvellement. Accès pendant la durée d’exploitation du SaaS.", "One payment, no renewal. Access for the operating lifetime of the SaaS.")}</small></span>
      </label>)}
    </fieldset>
    <p className="ss-onb-help">{t("Les quotas de traitement s’appliquent. Les abonnements Claude, Cursor et Codex ne sont pas inclus.", "Processing quotas apply. Claude, Cursor and Codex subscriptions are not included.")}</p>
    <label className="ss-onb-terms"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} disabled={busy} /> <span>{t("J’accepte les", "I accept the")} <a href="/terms" target="_blank" rel="noreferrer">{t("conditions de vente et d’utilisation", "terms of sale and use")}</a>.</span></label>
    {error && <p role="alert" className="ss-onb-error">{error}</p>}
    <button className="ss-onb-cta" disabled={!accepted || busy || pendingPayment} onClick={() => void pay()}>{busy ? t("Ouverture de Stripe…", "Opening Stripe…") : t("Continuer vers le paiement", "Continue to payment")}</button>
    {pendingPayment && <a className="ss-onb-link" href="/app">{t("Vérifier mon accès", "Check my access")}</a>}
    <p className="ss-onb-help">{t("Paiement sécurisé sur Stripe. Le studio s’ouvre après confirmation du paiement. Aucun essai gratuit.", "Secure payment on Stripe. The studio opens after payment confirmation. No free trial.")}</p>
  </div>;
}
