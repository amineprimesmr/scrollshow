"use client";

import { t } from "@/lib/i18n";
import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "idle" | "loading" | "waiting" | "scanned" | "connected" | "expired" | "error";

/**
 * Connexion depuis le téléphone : TikTok affiche un QR que l'utilisateur scanne
 * avec son app, où ses comptes sont déjà connectés. Aucun mot de passe à saisir
 * sur l'ordinateur.
 */
export function TikTokQrConnect({ english, onConnected }: { english: boolean; onConnected?: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [svg, setSvg] = useState("");
  const [handle, setHandle] = useState("");
  const token = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const poll = useCallback(() => {
    if (!live.current || !token.current) return;
    fetch(`/api/tiktok/oauth/qr?token=${encodeURIComponent(token.current)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!live.current) return;
        if (json.status === "connected") {
          setHandle(json.account?.handle || "");
          setPhase("connected");
          // Laisse le temps de lire la confirmation avant de fermer.
          timer.current = setTimeout(() => { onConnected?.(); window.location.reload(); }, 1400);
          return;
        }
        if (json.status === "expired" || json.status === "utilised") { setPhase("expired"); return; }
        if (!res.ok) { setPhase("error"); return; }
        if (json.status === "scanned") setPhase("scanned");
        timer.current = setTimeout(poll, 2000);
      })
      .catch(() => { if (live.current) setPhase("error"); });
  }, [onConnected]);

  const start = useCallback(async () => {
    setPhase("loading");
    setSvg("");
    try {
      const res = await fetch("/api/tiktok/oauth/qr", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.token) throw new Error(json.error || "qr");
      token.current = json.token;
      setSvg(json.svg || "");
      setPhase("waiting");
      timer.current = setTimeout(poll, 2000);
    } catch {
      setPhase("error");
    }
  }, [poll]);

  if (phase === "idle") {
    return (
      <button type="button" className="ss-btn-ghost ss-btn-wide ss-qr-open" onClick={() => void start()}>
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 14h3v3h-3zM20 14h1M14 20h3M20 17v4" strokeLinecap="round" /></svg>
        {t("Connecter depuis mon téléphone", "Connect from my phone", english)}
      </button>
    );
  }

  return (
    <div className="ss-qr">
      {phase === "loading" ? (
        <p className="ss-qr__note">{t("Génération du code…", "Generating the code…", english)}</p>
      ) : phase === "connected" ? (
        <p className="ss-qr__done">{t(`Compte connecté${handle ? ` : @${handle}` : ""}.`, `Account connected${handle ? `: @${handle}` : ""}.`, english)}</p>
      ) : phase === "expired" || phase === "error" ? (
        <>
          <p className="ss-qr__note">
            {phase === "expired"
              ? t("Le code a expiré.", "The code expired.", english)
              : t("Le code n’a pas pu être vérifié.", "The code could not be verified.", english)}
          </p>
          <button type="button" className="ss-btn-ghost" onClick={() => void start()}>{t("Nouveau code", "New code", english)}</button>
        </>
      ) : (
        <>
          <div className="ss-qr__code" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="ss-qr__note">
            {phase === "scanned"
              ? t("Code scanné : valide l’autorisation dans TikTok.", "Code scanned: confirm the authorization in TikTok.", english)
              : t("Ouvre l’appareil photo ou l’app TikTok de ton téléphone et scanne ce code.", "Open your phone camera or the TikTok app and scan this code.", english)}
          </p>
        </>
      )}
    </div>
  );
}
