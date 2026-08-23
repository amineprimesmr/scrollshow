"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function StudioFlash() {
  const params = useSearchParams();
  const [english, setEnglish] = useState(false);
  const connected = params.get("connected");
  const error = params.get("error");

  useEffect(() => {
    setEnglish(prefersEnglish());
  }, []);

  if (!connected && !error) return null;

  const errorCopy = {
    invalid_client: t(
      "Connexion TikTok : identifiants sandbox incorrects. Réessaie dans une minute.",
      "TikTok connection: sandbox credentials are wrong. Try again in a minute.",
      english,
    ),
    invalid_grant: t(
      "Connexion TikTok : le code a expiré. Reconnecte le compte.",
      "TikTok connection: the code expired. Connect the account again.",
      english,
    ),
    access_denied: t("Connexion TikTok refusée.", "TikTok connection was denied.", english),
    missing_code: t("Connexion TikTok incomplète. Réessaie.", "TikTok connection was incomplete. Try again.", english),
    state_mismatch: t("Connexion TikTok interrompue. Réessaie.", "TikTok connection was interrupted. Try again.", english),
    tiktok_not_configured: t("TikTok n’est pas encore configuré sur le serveur.", "TikTok is not configured on the server yet.", english),
  }[error || ""] || t("Connexion TikTok impossible. Réessaie.", "TikTok connection failed. Try again.", english);

  return (
    <p className={`ss-flash ${error ? "is-error" : ""}`}>
      {connected
        ? t("TikTok connecté. Profil, stats et posts sont disponibles.", "TikTok connected. Profile, stats, and posts are available.", english)
        : errorCopy}
    </p>
  );
}
