"use client";

import { t } from "@/lib/i18n";
import { PLATFORMS } from "@/lib/platforms";
import { useStudio } from "./StudioContext";
import { TikTokQrConnect } from "./TikTokQrConnect";

export function AddChannelModal() {
  const { addOpen, setAddOpen, english } = useStudio();
  if (!addOpen) return null;
  // ScrollShow ne publie que sur TikTok : pas de choix de plateforme à faire.
  const tiktok = PLATFORMS.find((item) => item.id === "tiktok")!;

  return (
    <div className="ss-modal" onClick={() => setAddOpen(false)}>
      <div className="ss-dialog ss-dialog--narrow" onClick={(event) => event.stopPropagation()}>
        <div className="ss-add-head">
          <img src={tiktok.logo} alt="" width={34} height={34} className="ss-platform-logo" />
          <div>
            <h2>{t("Ajouter un compte TikTok", "Add a TikTok account", english)}</h2>
            <p className="ss-lead">
              {t("Compte de publication Direct Post pour tes carrousels photo.", "Direct Post publishing account for photo carousels.", english)}
            </p>
          </div>
        </div>
        <a className="ss-btn-purple ss-btn-wide" href={tiktok.connectPath}>
          {t("Continuer avec TikTok", "Continue with TikTok", english)}
        </a>
        <TikTokQrConnect english={english} onConnected={() => setAddOpen(false)} />
        <p className="ss-lead ss-add-foot">
          <a href="/app/integrations">{t("Gérer mes connexions", "Manage my connections", english)}</a>
        </p>
      </div>
    </div>
  );
}
