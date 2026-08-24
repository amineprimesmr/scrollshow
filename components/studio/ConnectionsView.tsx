"use client";

import { t } from "@/lib/i18n";
import { familyConfigured, PLATFORMS, type PlatformAvailability } from "@/lib/platforms";
import { useState } from "react";
import { useStudio } from "./StudioContext";

export function ConnectionsView({ availability }: { availability: PlatformAvailability }) {
  const { english, channels, reload } = useStudio();
  const [busy, setBusy] = useState("");
  const live = channels.filter((item) => item.connected);

  async function disconnect(id: string, platform: string) {
    setBusy(id);
    await fetch(`/api/studio/channels/${id}`, { method: "DELETE" });
    if (platform === "tiktok") await fetch("/api/tiktok/disconnect", { method: "POST" });
    setBusy("");
    await reload();
  }

  return (
    <div className="ss-connect">
      <div className="ss-page-intro">
        <div>
          <p>
            {t(
              "Branche TikTok, Instagram, Facebook et X. La publication live est TikTok pour l’instant.",
              "Connect TikTok, Instagram, Facebook and X. Live publishing is TikTok for now.",
              english,
            )}
          </p>
          <p className="ss-muted">
            {live.length
              ? t(
                  `${live.length} compte${live.length > 1 ? "s" : ""} connecté${live.length > 1 ? "s" : ""}.`,
                  `${live.length} account${live.length > 1 ? "s" : ""} connected.`,
                  english,
                )
              : t("Aucun compte connecté pour l’instant.", "No account connected yet.", english)}
          </p>
        </div>
        <a className="ss-btn-ghost" href="/app/mcp">
          {t("MCP · agents IA", "MCP · AI agents", english)}
        </a>
      </div>

      <div className="ss-network-grid">
        {PLATFORMS.map((platform) => {
          const accounts = channels.filter((item) => item.platform === platform.id && item.connected);
          const configured = familyConfigured(platform.family, availability);
          const coming = !configured && platform.id !== "tiktok";
          const connected = accounts.length > 0;
          const badge = connected
            ? t("Connecté", "Connected", english)
            : platform.lifecycle === "pending_review"
              ? t("Sandbox", "Sandbox", english)
              : configured
                ? t("Prêt", "Ready", english)
                : t("Bientôt", "Soon", english);
          const badgeClass = connected ? "is-ready" : configured || platform.id === "tiktok" ? "is-review" : "is-wait";
          return (
            <article key={platform.id} className="ss-network-card">
              <header>
                <img
                  src={platform.logo}
                  alt=""
                  width={36}
                  height={36}
                  className={`ss-platform-logo${platform.id === "x" ? " is-x" : ""}${platform.id === "facebook" ? " is-facebook" : ""}`}
                />
                <div>
                  <h2>{platform.name}</h2>
                  <span className={`ss-badge ${badgeClass}`}>{badge}</span>
                </div>
              </header>
              <p>
                {platform.family === "tiktok"
                  ? t("Compte de publication Direct Post pour tes carrousels photo.", "Direct Post publishing account for photo carousels.", english)
                  : coming
                    ? t("On branche cette plateforme ensuite. TikTok d’abord.", "This platform comes next. TikTok first.", english)
                    : t("Connecte le compte pour l’utiliser depuis le calendrier.", "Connect the account to use it from the calendar.", english)}
              </p>
              {accounts.length ? (
                <ul className="ss-connect-accounts">
                  {accounts.map((channel) => (
                    <li key={channel.id}>
                      <img src={channel.avatar || platform.logo} alt="" />
                      <span>
                        <b>@{channel.handle}</b>
                        <span>
                          {channel.followers
                            ? `${channel.followers.toLocaleString(english ? "en-US" : "fr-FR")} ${t("abonnés", "followers", english)}`
                            : channel.name}
                        </span>
                      </span>
                      <button className="ss-btn-ghost" type="button" disabled={busy === channel.id} onClick={() => void disconnect(channel.id, channel.platform)}>
                        {t("Déconnecter", "Disconnect", english)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {coming ? (
                <button className="ss-btn-ghost" type="button" disabled>
                  {t("Bientôt", "Soon", english)}
                </button>
              ) : (
                <a className="ss-btn-purple" href={platform.connectPath}>
                  {connected ? t("Reconnecter", "Reconnect", english) : t("Connecter", "Connect", english)}
                </a>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
