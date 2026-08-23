"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useStudio } from "./StudioContext";

export function AddChannelModal() {
  const { addOpen, setAddOpen } = useStudio();
  const [english, setEnglish] = useState(false);

  useEffect(() => {
    setEnglish(prefersEnglish());
  }, []);

  if (!addOpen) return null;

  return (
    <div className="ss-modal" onClick={() => setAddOpen(false)}>
      <div className="ss-dialog ss-dialog--narrow" onClick={(event) => event.stopPropagation()}>
        <h2>{t("Connecter TikTok", "Connect TikTok", english)}</h2>
        <p className="ss-lead">
          {t(
            "Login Kit officiel : on récupère le profil, les stats, tes posts, puis tu publies un carrousel en Direct Post.",
            "Official Login Kit: we load profile, stats, and posts, then you publish a photo carousel with Direct Post.",
            english,
          )}
        </p>
        <div className="ss-platforms">
          <button type="button" className="is-on" disabled>
            <span className="ss-dot" style={{ background: "#111" }} />
            TikTok
          </button>
        </div>
        <ul className="ss-scope-list">
          <li>user.info.basic</li>
          <li>user.info.profile</li>
          <li>user.info.stats</li>
          <li>video.list</li>
          <li>video.upload</li>
          <li>video.publish</li>
        </ul>
        <a className="ss-btn-purple ss-btn-wide" href="/api/tiktok/oauth/start">
          {t("Continuer avec TikTok", "Continue with TikTok", english)}
        </a>
      </div>
    </div>
  );
}
