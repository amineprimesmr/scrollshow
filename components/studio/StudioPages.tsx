"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useStudio } from "./StudioContext";

export function BillingView() {
  const { user } = useStudio();
  const [english, setEnglish] = useState(false);
  const [busy, setBusy] = useState(false);
  const plan = user?.plan || "free";

  useEffect(() => {
    setEnglish(prefersEnglish());
  }, []);

  async function openPortal() {
    setBusy(true);
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (json.url) window.location.href = json.url;
  }

  return (
    <div className="ss-panel">
      <h2>{t("Facturation", "Billing", english)}</h2>
      <p className="ss-lead">
        {t("Plan actuel :", "Current plan:", english)} <strong>{plan}</strong>
      </p>
      <button className="ss-btn-purple" type="button" disabled={busy} onClick={() => void openPortal()}>
        {t("Gérer l'abonnement", "Manage subscription", english)}
      </button>
    </div>
  );
}
