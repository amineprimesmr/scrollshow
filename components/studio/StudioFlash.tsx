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
    meta_not_configured: t("Meta n’est pas encore configuré. Ajoute META_APP_ID et META_APP_SECRET.", "Meta is not configured yet. Add META_APP_ID and META_APP_SECRET.", english),
    meta_denied: t("Connexion Meta annulée.", "Meta connection was cancelled.", english),
    meta: t("Impossible de connecter Meta. Réessaie.", "Could not connect Meta. Try again.", english),
    meta_no_page: t("Aucune Page Facebook trouvée sur ce compte.", "No Facebook Page found on this account.", english),
    meta_no_instagram: t("Aucun compte Instagram pro lié à une Page Facebook.", "No professional Instagram account linked to a Facebook Page.", english),
    x_not_configured: t("X n’est pas encore configuré. Ajoute X_CLIENT_ID et X_CLIENT_SECRET.", "X is not configured yet. Add X_CLIENT_ID and X_CLIENT_SECRET.", english),
    x_denied: t("Connexion X annulée.", "X connection was cancelled.", english),
    x: t("Impossible de connecter X. Réessaie.", "Could not connect X. Try again.", english),
  }[error || ""] || t("Connexion impossible. Réessaie.", "Connection failed. Try again.", english);

  const connectedCopy =
    connected === "meta"
      ? t("Meta connecté. Instagram et Facebook sont disponibles.", "Meta connected. Instagram and Facebook are available.", english)
      : connected === "x"
        ? t("X connecté.", "X connected.", english)
        : t("TikTok connecté. Profil, stats et posts sont disponibles.", "TikTok connected. Profile, stats, and posts are available.", english);

  return (
    <p className={`ss-flash ${error ? "is-error" : ""}`}>
      {connected
        ? connectedCopy
        : errorCopy}
    </p>
  );
}
