"use client";

import { t } from "@/lib/i18n";
import { PLATFORMS } from "@/lib/platforms";
import { useStudio } from "./StudioContext";
import { TikTokQrConnect } from "./TikTokQrConnect";
import { useEffect, useState } from "react";

export function AddChannelModal() {
  const { addOpen, setAddOpen, english, reload, user } = useStudio();
  const [connected, setConnected] = useState(false);
  useEffect(() => { if (!addOpen) setConnected(false); }, [addOpen]);
  if (!addOpen) return null;
  // ScrollShow ne publie que sur TikTok : pas de choix de plateforme à faire.
  const tiktok = PLATFORMS.find((item) => item.id === "tiktok")!;

  return (
    <div className="ss-modal" onClick={() => setAddOpen(false)}>
      <div className="ss-dialog ss-dialog--narrow" onClick={(event) => event.stopPropagation()}>
        <div className="ss-add-head">
          <img src={tiktok.logo} alt="" width={34} height={34} className="ss-platform-logo" />
          <div>
            <h2>{connected ? t("Ton compte TikTok est connecté", "Your TikTok account is connected", english) : t("Ajouter un compte TikTok", "Add a TikTok account", english)}</h2>
            <p className="ss-lead">
              {connected ? t("Connexion confirmée par ScrollShow.", "Connection confirmed by ScrollShow.", english) : t("Choisis comment autoriser ton compte TikTok.", "Choose how to authorize your TikTok account.", english)}
            </p>
          </div>
        </div>
        {!connected ? <><a className="ss-btn-purple ss-btn-wide" href={tiktok.connectPath}>
          {t("Connecter dans le navigateur", "Connect in the browser", english)}
        </a>
        <p className="ss-add-method-note">{t("Ouvre la page d’autorisation TikTok sur cet appareil.", "Open TikTok’s authorization page on this device.", english)}</p></> : null}
        {user ? <TikTokQrConnect english={english} workspaceId={user.id} onConnected={async () => { setConnected(true); await reload({ throwOnError: true }); }} onClose={() => setAddOpen(false)} /> : null}
        <p className="ss-lead ss-add-foot">
          <a href="/app/integrations">{t("Gérer mes connexions", "Manage my connections", english)}</a>
        </p>
      </div>
    </div>
  );
}
