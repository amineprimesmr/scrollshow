"use client";
import { PricingCards } from "@/components/PricingCards";
import "./onboarding-payment.css";

/**
 * Derniere etape de l'onboarding. Elle reprend les cartes de /pricing plutot
 * que sa propre liste d'offres : meme design, meme appel a Stripe, un seul
 * endroit a maintenir. Payer vaut acceptation des conditions de vente :
 * pas de case a cocher ici, Stripe les rappelle a l'ecran de paiement.
 */
export function OnboardingPayment({ english, canceled = false, pendingPayment = false }: {
  english: boolean;
  initialOffer?: "monthly" | "lifetime";
  canceled?: boolean;
  pendingPayment?: boolean;
}) {
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

      {/* Le fieldset ne bloque plus que pendant un paiement en attente. */}
      <fieldset className="ss-onb-pay__offers" disabled={pendingPayment}>
        <PricingCards english={english} destination="/signup" />
      </fieldset>

      {pendingPayment && (
        <a className="ss-onb-link" href="/app">{t("Vérifier mon accès", "Check my access")}</a>
      )}
    </div>
  );
}
