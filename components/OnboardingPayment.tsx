"use client";
import { useState } from "react";
import { PricingCards } from "@/components/PricingCards";
import "./onboarding-payment.css";

/**
 * Derniere etape de l'onboarding. Elle reprend les cartes de /pricing plutot
 * que sa propre liste d'offres : meme design, meme appel a Stripe, un seul
 * endroit a maintenir. L'acceptation explicite des conditions reste, elle
 * n'existe pas sur /pricing et c'est un garde-fou qu'on ne retire pas.
 */
export function OnboardingPayment({ english, canceled = false, pendingPayment = false }: {
  english: boolean;
  initialOffer?: "monthly" | "lifetime";
  canceled?: boolean;
  pendingPayment?: boolean;
}) {
  const [accepted, setAccepted] = useState(false);
  const t = (fr: string, en: string) => (english ? en : fr);

  return (
    <div className="ss-onb-pay">
      {canceled && (
        <p className="ss-onb-pay__notice" role="status">
          {t("Paiement interrompu. Tes informations sont conservées, tu peux reprendre ici.", "Checkout canceled. Your details are saved; you can resume here.")}
        </p>
      )}

      {pendingPayment && (
        <p className="ss-onb-pay__notice" role="status">
          {t("Le paiement n’est pas encore confirmé. Si tu as été débité, ne paie pas une seconde fois : attends la confirmation ou contacte le support.", "Payment is not confirmed yet. If you were charged, do not pay again: wait for confirmation or contact support.")}{" "}
          <a href="mailto:aminennasri@outlook.com">Support</a>
        </p>
      )}

      <label className="ss-onb-pay__terms">
        <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={pendingPayment} />
        <span>
          {t("J’accepte les", "I accept the")}{" "}
          <a href="/terms" target="_blank" rel="noreferrer">{t("conditions de vente et d’utilisation", "terms of sale and use")}</a>.
        </span>
      </label>

      {/* Le fieldset desactive les deux boutons tant que les conditions ne sont pas acceptees. */}
      <fieldset className="ss-onb-pay__offers" disabled={!accepted || pendingPayment}>
        <PricingCards english={english} destination="/signup" />
      </fieldset>

      {!accepted && (
        <p className="ss-onb-pay__hint">
          {t("Coche la case ci-dessus pour choisir ton offre.", "Tick the box above to choose your plan.")}
        </p>
      )}

      <p className="ss-onb-pay__foot">
        {t("Paiement sécurisé sur Stripe. Le studio s’ouvre après confirmation du paiement. Aucun essai gratuit.", "Secure payment on Stripe. The studio opens after payment confirmation. No free trial.")}
      </p>

      {pendingPayment && (
        <a className="ss-onb-link" href="/app">{t("Vérifier mon accès", "Check my access")}</a>
      )}
    </div>
  );
}
