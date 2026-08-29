"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import { useEffect, useState } from "react";

export function WarmedAccountsView() {
  const [english, setEnglish] = useState(false);
  useEffect(() => setEnglish(prefersEnglish()), []);
  const en = english;
  return (
    <div className="ss-empty" style={{ margin: 24 }}>
      <h2>{t("Comptes warmés", "Warmed Accounts", en)}</h2>
      <p>{t("Comptes TikTok/IG US/EU warmés sur vrais téléphones — à partir de 80€/mois.", "Real US/EU TikTok/IG accounts warmed on real phones — from $80/month.", en)}</p>
      <a href="mailto:support@scrollshow.io?subject=Comptes%20warm%C3%A9s" className="ss-btn-purple">
        {t("Nous contacter", "Contact us", en)}
      </a>
    </div>
  );
}
