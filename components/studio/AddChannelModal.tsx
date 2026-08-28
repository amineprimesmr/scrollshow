"use client";

import { t } from "@/lib/i18n";
import { familyConfigured, PLATFORMS } from "@/lib/platforms";
import { useState } from "react";
import { useStudio } from "./StudioContext";

export function AddChannelModal() {
  const { addOpen, setAddOpen, availability, english } = useStudio();
  const [picked, setPicked] = useState<(typeof PLATFORMS)[number]["id"]>("tiktok");

  if (!addOpen) return null;
  const platform = PLATFORMS.find((item) => item.id === picked) || PLATFORMS[0];
  const configured = availability ? familyConfigured(platform.family, availability) : platform.id === "tiktok";
  const coming = !configured && platform.id !== "tiktok";

  return (
    <div className="ss-modal" onClick={() => setAddOpen(false)}>
      <div className="ss-dialog ss-dialog--narrow" onClick={(event) => event.stopPropagation()}>
        <h2>{t("Ajouter un compte", "Add an account", english)}</h2>
        <p className="ss-lead">
          {t("Connecte un compte depuis Connexions, ou continue ici.", "Connect an account from Connections, or continue here.", english)}{" "}
          <a href="/app/integrations">{t("Ouvrir Connexions", "Open Connections", english)}</a>
        </p>
        <div className="ss-platforms">
          {PLATFORMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={picked === item.id ? "is-on" : ""}
              onClick={() => setPicked(item.id)}
            >
              <img
                src={item.logo}
                alt=""
                width={28}
                height={28}
                className={`ss-platform-logo${item.id === "x" ? " is-x" : ""}${item.id === "facebook" ? " is-facebook" : ""}`}
              />
              {item.name}
            </button>
          ))}
        </div>
        {platform.family === "tiktok" ? (
          <p className="ss-lead">
            {t("Compte de publication Direct Post pour tes carrousels photo.", "Direct Post publishing account for photo carousels.", english)}
          </p>
        ) : platform.family === "meta" ? (
          <p className="ss-lead">
            {t(
              "Instagram et Facebook passent par une seule app Meta (Facebook Login + Instagram Graph).",
              "Instagram and Facebook use one Meta app (Facebook Login + Instagram Graph).",
              english,
            )}
          </p>
        ) : (
          <p className="ss-lead">
            {t("X utilise OAuth 2.0 (PKCE) pour publier et lire le compte.", "X uses OAuth 2.0 (PKCE) to publish and read the account.", english)}
          </p>
        )}
        {coming ? (
          <button className="ss-btn-ghost ss-btn-wide" type="button" disabled>
            {t("Bientôt", "Soon", english)}
          </button>
        ) : (
          <a className="ss-btn-purple ss-btn-wide" href={platform.connectPath}>
            {t(`Continuer avec ${platform.name}`, `Continue with ${platform.name}`, english)}
          </a>
        )}
      </div>
    </div>
  );
}
