"use client";

import { t } from "@/lib/i18n";
import { PLATFORMS } from "@/lib/platforms";
import { useState } from "react";
import { useStudio } from "./StudioContext";

const tiktok = PLATFORMS.find((item) => item.id === "tiktok")!;

export function ConnectionsView() {
  const { english, channels, reload } = useStudio();
  const [busy, setBusy] = useState("");
  const accounts = channels.filter((item) => item.platform === "tiktok" && item.connected);
  const connected = accounts.length > 0;

  async function disconnect(id: string) {
    setBusy(id);
    await fetch("/api/tiktok/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: id }),
    });
    setBusy("");
    await reload();
  }

  return (
    <div className="ss-connect">
      <div className="ss-network-list">
        <article className={`ss-network-card${connected ? " is-live" : ""}`}>
          <div className="ss-network-card__head">
            <img src={tiktok.logo} alt="" width={42} height={42} className="ss-platform-logo" />
            <div>
              <h2>{t("TikTok", "TikTok", english)}</h2>
              <span className={`ss-badge ${connected ? "is-ready" : "is-review"}`}>
                {connected
                  ? t(`${accounts.length} compte${accounts.length > 1 ? "s" : ""} connecté${accounts.length > 1 ? "s" : ""}`, `${accounts.length} account${accounts.length > 1 ? "s" : ""} connected`, english)
                  : t("Non connecté", "Not connected", english)}
              </span>
            </div>
            {!connected ? (
              <a className="ss-btn-purple" href={tiktok.connectPath}>
                {t("Connecter", "Connect", english)}
              </a>
            ) : null}
          </div>

          {!connected ? (
            <div className="ss-network-card__hint">
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
                {t(
                  "Connecte-toi d’abord à TikTok dans ce navigateur, puis clique sur Connecter — tu seras redirigé vers l’écran d’autorisation officiel de TikTok.",
                  "Sign in to TikTok in this browser first, then click Connect — you’ll be sent to TikTok’s official authorization screen.",
                  english,
                )}
              </span>
            </div>
          ) : (
            <>
              <div className="ss-network-accounts">
                {accounts.map((channel) => (
                  <div className="ss-network-account" key={channel.id}>
                    <img src={channel.avatar || tiktok.logo} alt="" />
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
                      onClick={() => void disconnect(channel.id)}
                    >
                      {busy === channel.id ? t("…", "…", english) : t("Déconnecter", "Disconnect", english)}
                    </button>
                  </div>
                ))}
              </div>
              <a className="ss-btn-ghost ss-network-add" href={tiktok.connectPath}>
                + {t("Connecter un autre compte", "Connect another account", english)}
              </a>
            </>
          )}
        </article>
      </div>
    </div>
  );
}
