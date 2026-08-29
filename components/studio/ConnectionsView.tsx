"use client";

import { t } from "@/lib/i18n";
import { familyConfigured, PLATFORMS, type PlatformAvailability, type PlatformId } from "@/lib/platforms";
import { useState } from "react";
import { useStudio } from "./StudioContext";

const HINTS: Record<PlatformId, { fr: string; en: string }> = {
  tiktok: {
    fr: "Connecte-toi d’abord à TikTok dans ce navigateur, puis clique sur Connecter — tu seras redirigé vers l’écran d’autorisation officiel de TikTok.",
    en: "Sign in to TikTok in this browser first, then click Connect — you’ll be sent to TikTok’s official authorization screen.",
  },
  instagram: {
    fr: "Nécessite un compte professionnel ou créateur Instagram lié à une Page Facebook. Connecte-toi d’abord à Facebook dans ce navigateur.",
    en: "Requires an Instagram business or creator account linked to a Facebook Page. Sign in to Facebook in this browser first.",
  },
  facebook: {
    fr: "Connecte-toi d’abord à Facebook dans ce navigateur avant de cliquer sur Connecter.",
    en: "Sign in to Facebook in this browser before clicking Connect.",
  },
  x: {
    fr: "Connecte-toi d’abord à X dans ce navigateur, puis autorise l’accès à ton compte.",
    en: "Sign in to X in this browser first, then authorize account access.",
  },
};

export function ConnectionsView({ availability }: { availability: PlatformAvailability }) {
  const { english, channels, reload } = useStudio();
  const [busy, setBusy] = useState("");

  async function disconnect(id: string, platform: string) {
    setBusy(id);
    // /api/tiktok/disconnect both revokes the token and removes the channel —
    // calling the generic DELETE first would remove the channel before it can
    // be looked up there, and the revoke would silently never fire.
    if (platform === "tiktok") await fetch("/api/tiktok/disconnect", { method: "POST" });
    else await fetch(`/api/studio/channels/${id}`, { method: "DELETE" });
    setBusy("");
    await reload();
  }

  return (
    <div className="ss-connect">
      <div className="ss-network-list">
        {PLATFORMS.map((platform) => {
          const accounts = channels.filter((item) => item.platform === platform.id && item.connected);
          const configured = familyConfigured(platform.family, availability);
          const coming = !configured && platform.id !== "tiktok";
          const connected = accounts.length > 0;
          const badge = connected
            ? t("Connecté", "Connected", english)
            : platform.lifecycle === "pending_review"
              ? t("Sandbox", "Sandbox", english)
              : coming
                ? t("Bientôt", "Soon", english)
                : t("Non connecté", "Not connected", english);
          const badgeClass = connected ? "is-ready" : coming ? "is-wait" : "is-review";
          const hint = HINTS[platform.id];
          return (
            <article key={platform.id} className={`ss-network-card${connected ? " is-live" : ""}`}>
              <div className="ss-network-card__head">
                <img
                  src={platform.logo}
                  alt=""
                  width={42}
                  height={42}
                  className={`ss-platform-logo${platform.id === "x" ? " is-x" : ""}${platform.id === "facebook" ? " is-facebook" : ""}`}
                />
                <div>
                  <h2>{platform.name}</h2>
                  <span className={`ss-badge ${badgeClass}`}>{badge}</span>
                </div>
                {coming ? (
                  <button className="ss-btn-ghost" type="button" disabled>
                    {t("Bientôt", "Soon", english)}
                  </button>
                ) : (
                  <a className="ss-btn-purple" href={platform.connectPath}>
                    {connected ? t("Reconnecter", "Reconnect", english) : t("Connecter", "Connect", english)}
                  </a>
                )}
              </div>

              {!connected ? (
                <div className={`ss-network-card__hint${coming ? " is-soon" : ""}`}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>
                    {coming
                      ? t("On branche cette plateforme ensuite. TikTok d’abord.", "This platform comes next. TikTok first.", english)
                      : t(hint.fr, hint.en, english)}
                  </span>
                </div>
              ) : null}

              {accounts.length ? (
                <div className="ss-network-accounts">
                  {accounts.map((channel) => (
                    <div className="ss-network-account" key={channel.id}>
                      <img src={channel.avatar || platform.logo} alt="" />
                      <span>
                        <b>@{channel.handle}</b>
                        <span className="ss-network-account__sub">
                          {channel.followers
                            ? `${channel.followers.toLocaleString(english ? "en-US" : "fr-FR")} ${t("abonnés", "followers", english)}`
                            : channel.name}
                        </span>
                      </span>
                      <button
                        className="ss-btn-ghost"
                        type="button"
                        disabled={busy === channel.id}
                        onClick={() => void disconnect(channel.id, channel.platform)}
                      >
                        {busy === channel.id ? t("…", "…", english) : t("Déconnecter", "Disconnect", english)}
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
