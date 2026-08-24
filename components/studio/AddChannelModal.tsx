"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import { PLATFORMS } from "@/lib/platforms";
import { useEffect, useState } from "react";
import { useStudio } from "./StudioContext";

export function AddChannelModal() {
  const { addOpen, setAddOpen } = useStudio();
  const [english, setEnglish] = useState(false);
  const [picked, setPicked] = useState<(typeof PLATFORMS)[number]["id"]>("tiktok");

  useEffect(() => {
    setEnglish(prefersEnglish());
  }, []);

  if (!addOpen) return null;
  const platform = PLATFORMS.find((item) => item.id === picked) || PLATFORMS[0];

  return (
    <div className="ss-modal" onClick={() => setAddOpen(false)}>
      <div className="ss-dialog ss-dialog--narrow" onClick={(event) => event.stopPropagation()}>
        <h2>{t("Ajouter un compte", "Add an account", english)}</h2>
        <p className="ss-lead">
          {t(
            "TikTok est en revue. Meta et X sont prêts : on branche les clés, puis tu connectes le compte.",
            "TikTok is in review. Meta and X are ready: add the keys, then connect the account.",
            english,
          )}
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
                className={item.id === "x" ? "ss-platform-logo is-x" : "ss-platform-logo"}
              />
              {item.name}
            </button>
          ))}
        </div>
        {platform.lifecycle === "pending_review" ? (
          <p className="ss-lead">
            {t(
              "TikTok Login Kit est envoyé en revue. Tu peux déjà connecter le sandbox.",
              "TikTok Login Kit is in review. You can already connect the sandbox.",
              english,
            )}
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
        <a className="ss-btn-purple ss-btn-wide" href={platform.connectPath}>
          {t(`Continuer avec ${platform.name}`, `Continue with ${platform.name}`, english)}
        </a>
      </div>
    </div>
  );
}
