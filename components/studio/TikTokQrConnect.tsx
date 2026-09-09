"use client";

import { t } from "@/lib/i18n";
import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "idle" | "loading" | "restoring" | "waiting" | "scanned" | "saving" | "retrying" | "connected" | "expired" | "error";

export function TikTokQrConnect({ english, workspaceId, onConnected, onClose }: {
  english: boolean;
  workspaceId: string;
  onConnected?: () => void | Promise<void>;
  onClose?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [svg, setSvg] = useState("");
  const [handle, setHandle] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const attempt = useRef("");
  const deadline = useRef(0);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const failures = useRef(0);
  const needsSvg = useRef(false);
  const onComplete = useRef(onConnected);
  onComplete.current = onConnected;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef(true);
  const storageKey = `ss-tiktok-qr:${workspaceId}`;

  const forget = useCallback(() => {
    try { sessionStorage.removeItem(storageKey); } catch { /* Storage can be disabled. */ }
  }, [storageKey]);

  const refreshStudio = useCallback(async () => {
    setRefreshing(true);
    try { await onComplete.current?.(); if (live.current) setRefreshFailed(false); }
    catch { if (live.current) setRefreshFailed(true); }
    finally { if (live.current) setRefreshing(false); }
  }, []);

  const poll = useCallback(function pollCurrent() {
    if (!live.current || !attempt.current) return;
    const current = generation.current;
    const controller = new AbortController();
    request.current = controller;
    const retry = (seconds?: number) => {
      // Always ask the server before concluding: its saved receipt can outlive
      // the QR. Stop automatic network retries without inventing an expiry.
      if (Date.now() >= deadline.current) { setErrorCode("verification_timeout"); setPhase("error"); return; }
      failures.current++;
      setPhase("retrying");
      const delay = seconds ? Math.min(60, Math.max(2, seconds)) * 1000 : Math.min(15000, 2000 * 2 ** Math.min(failures.current - 1, 3));
      timer.current = setTimeout(pollCurrent, delay);
    };
    fetch(`/api/tiktok/oauth/qr?id=${encodeURIComponent(attempt.current)}${needsSvg.current ? "&resume=1" : ""}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]) })
      .then(async res => {
        const json = await res.json().catch(() => ({}));
        if (!live.current || current !== generation.current) return;
        if (json.expiresAt) deadline.current = json.expiresAt;
        if (json.svg) { setSvg(json.svg); needsSvg.current = false; }
        if (!res.ok || json.status === "error") {
          if (json.retryable === true || (json.retryable !== false && (res.status >= 500 || res.status === 429))) { retry(json.retryAfter); return; }
          setErrorCode(json.error || "qr_unavailable"); setPhase("error"); forget(); return;
        }
        if (json.status === "connected") {
          setHandle(json.account?.handle ? `@${json.account.handle}` : json.account?.name || "TikTok");
          setPhase("connected"); setShowHelp(false);
          // Keep the receipt until Done, so reopening the dialog can recover it.
          void refreshStudio();
          return;
        }
        if (json.status === "expired") { setPhase("expired"); forget(); return; }
        if (json.status === "retrying") { retry(json.retryAfter); return; }
        if (!["new", "scanned", "saving"].includes(json.status)) { retry(); return; }
        failures.current = 0;
        setPhase(json.status === "saving" ? "saving" : json.status === "scanned" ? "scanned" : "waiting");
        timer.current = setTimeout(pollCurrent, 2000);
      })
      .catch(() => { if (live.current && current === generation.current) retry(); });
  }, [forget, refreshStudio]);

  useEffect(() => {
    live.current = true;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        attempt.current = saved; needsSvg.current = true;
        deadline.current = Date.now() + 600000;
        setPhase("restoring"); timer.current = setTimeout(poll, 0);
      }
    } catch { /* A blocked sessionStorage must not block login. */ }
    return () => {
      live.current = false; generation.current++;
      request.current?.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll, storageKey]);

  const start = useCallback(async () => {
    const current = ++generation.current;
    if (timer.current) clearTimeout(timer.current);
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    attempt.current = ""; failures.current = 0; needsSvg.current = false; forget();
    setPhase("loading"); setErrorCode(""); setShowHelp(false); setRefreshFailed(false); setSvg("");
    try {
      const res = await fetch("/api/tiktok/oauth/qr", { method: "POST", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]) });
      const json = await res.json().catch(() => ({}));
      if (!live.current || current !== generation.current) return;
      if (!res.ok || !json.id || !json.svg) { setErrorCode(json.error || "qr_unavailable"); setPhase("error"); return; }
      attempt.current = json.id; deadline.current = json.expiresAt || Date.now() + 600000;
      try { sessionStorage.setItem(storageKey, json.id); } catch { /* Optional recovery. */ }
      setSvg(json.svg); setPhase("waiting"); timer.current = setTimeout(poll, 2000);
    } catch {
      if (live.current && current === generation.current) { setErrorCode("network"); setPhase("error"); }
    }
  }, [forget, poll, storageKey]);

  const checkNow = () => {
    if (timer.current) clearTimeout(timer.current);
    generation.current++; request.current?.abort();
    poll();
  };

  const errors: Record<string, string> = {
    unauthorized: t("Ta session a expiré. Recharge la page et reconnecte-toi.", "Your session expired. Reload the page and sign in again.", english),
    invalid_scope: t("TikTok n’a pas accepté les autorisations demandées. Essaie la connexion dans le navigateur.", "TikTok did not accept the requested permissions. Try connecting in the browser.", english),
    invalid_client: t("La configuration TikTok de ScrollShow doit être corrigée.", "ScrollShow’s TikTok configuration needs to be corrected.", english),
    access_denied: t("L’autorisation a été refusée dans TikTok.", "Authorization was denied in TikTok.", english),
    rate_limited: t("Trop de tentatives. Attends une minute avant de réessayer.", "Too many attempts. Wait a minute before trying again.", english),
    network: t("Connexion interrompue pendant la préparation du QR. Réessaie.", "Connection interrupted while preparing the QR. Try again.", english),
    state_mismatch: t("Cette autorisation ne correspond pas au QR affiché. Génère un nouveau code.", "This authorization does not match the displayed QR. Generate a new code.", english),
    missing_code: t("TikTok n’a pas transmis le code d’autorisation. Continue dans le navigateur.", "TikTok did not send the authorization code. Continue in the browser.", english),
    invalid_request: t("TikTok a rejeté cette tentative QR. Le compte n’a pas été relié par cette tentative. Continue dans le navigateur.", "TikTok rejected this QR attempt. This attempt did not link the account. Continue in the browser.", english),
    redirect_mismatch: t("TikTok a refusé le retour d’autorisation du QR. Continue dans le navigateur.", "TikTok rejected the QR authorization callback. Continue in the browser.", english),
    confirmation_lost: t("TikTok a déjà transmis cette autorisation, mais son enregistrement n’a pas pu être confirmé. Reconnecte le compte dans le navigateur.", "TikTok already sent this authorization, but its recording could not be confirmed. Reconnect the account in the browser.", english),
    invalid_grant: t("L’autorisation TikTok n’est plus utilisable. Recommence la connexion.", "This TikTok authorization is no longer usable. Connect again.", english),
    account_removed: t("Ce compte a été déconnecté depuis cette autorisation. Reconnecte-le.", "This account was disconnected after authorization. Connect it again.", english),
    verification_timeout: t("La vérification reste indisponible. Le résultat est incertain : vérifie à nouveau avant de recommencer la connexion.", "Verification is still unavailable. The result is uncertain: check again before connecting again.", english),
  };

  if (phase === "idle") return <button type="button" className="ss-btn-ghost ss-btn-wide ss-qr-open" onClick={() => void start()}>{t("Utiliser le QR dans TikTok", "Use the QR in TikTok", english)}</button>;

  return (
    <div className="ss-qr" aria-live="polite">
      {phase === "loading" || phase === "restoring" ? <>
        <div className="ss-qr__placeholder" aria-hidden="true"><span className="ss-qr__spinner" /></div>
        <p className="ss-qr__note" role="status">{phase === "restoring" ? t("Vérification de ta dernière connexion…", "Checking your last connection…", english) : t("Préparation du QR…", "Preparing the QR…", english)}</p>
      </> : phase === "connected" ? <>
        <p className="ss-qr__done" role="status">{t(`Compte connecté : ${handle}`, `Account connected: ${handle}`, english)}</p>
        <p className="ss-qr__note">{t("L’autorisation a bien été enregistrée dans ScrollShow. Tu peux fermer TikTok sur ton téléphone.", "Your authorization is saved in ScrollShow. You can close TikTok on your phone.", english)}</p>
        {refreshing ? <p className="ss-qr__note">{t("Actualisation de tes comptes…", "Refreshing your accounts…", english)}</p> : refreshFailed ? <>
          <p className="ss-qr__note">{t("Le compte est enregistré, mais l’affichage du studio n’a pas pu être actualisé.", "The account is saved, but the studio display could not be refreshed.", english)}</p>
          <button type="button" className="ss-btn-ghost" onClick={() => void refreshStudio()}>{t("Actualiser le studio", "Refresh studio", english)}</button>
        </> : <a className="ss-btn-ghost" href="/app/integrations" onClick={forget}>{t("Voir mes comptes", "View my accounts", english)}</a>}
        {onClose ? <button type="button" className="ss-btn-ghost" onClick={() => { forget(); onClose(); }}>{t("Terminer", "Done", english)}</button> : null}
      </> : phase === "expired" || phase === "error" ? <>
        <strong>{t("Connexion non confirmée", "Connection not confirmed", english)}</strong>
        <p className="ss-qr__note">{phase === "expired" ? t("Ce QR a expiré sans connexion confirmée. Génère un nouveau code ou continue dans le navigateur.", "This QR expired without a confirmed connection. Generate a new code or continue in the browser.", english) : errors[errorCode] || t("La connexion n’a pas pu être confirmée. Continue dans le navigateur.", "The connection could not be confirmed. Continue in the browser.", english)}</p>
        <a className="ss-btn-ghost" href="/api/tiktok/oauth/start">{t("Continuer dans le navigateur", "Continue in the browser", english)}</a>
        {errorCode === "verification_timeout" ? <button type="button" className="ss-btn-ghost" onClick={() => { deadline.current = Date.now() + 60000; setPhase("restoring"); checkNow(); }}>{t("Vérifier à nouveau", "Check again", english)}</button> : null}
        <button type="button" className="ss-btn-ghost" onClick={() => void start()}>{t("Nouveau QR", "New QR", english)}</button>
      </> : phase === "saving" ? <>
        <span className="ss-qr__spinner" aria-hidden="true" />
        <strong>{t("Autorisation reçue", "Authorization received", english)}</strong>
        <p className="ss-qr__note" role="status">{t("Enregistrement de ton compte dans ScrollShow… La confirmation apparaîtra ici.", "Saving your account in ScrollShow… Confirmation will appear here.", english)}</p>
      </> : <>
        {svg && !showHelp ? <div className="ss-qr__code" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} /> : null}
        <p className="ss-qr__note" role="status">{phase === "retrying"
          ? t("La vérification a été interrompue. ScrollShow réessaie automatiquement ; garde cette fenêtre ouverte.", "Verification was interrupted. ScrollShow is retrying automatically; keep this window open.", english)
          : phase === "scanned"
            ? t("QR reconnu. Appuie sur Continuer dans TikTok. La confirmation de connexion apparaîtra ici.", "QR recognized. Tap Continue in TikTok. Connection confirmation will appear here.", english)
            : t("Scanne avec le scanner intégré à TikTok, puis autorise ScrollShow. Le compte apparaîtra ici après confirmation.", "Scan with TikTok’s built-in scanner, then authorize ScrollShow. Your account will appear here after confirmation.", english)}</p>
        {showHelp ? <div className="ss-qr__help">
          <strong>{t("TikTok tarde à s’ouvrir ?", "TikTok taking a while to open?", english)}</strong>
          <p>{t("Tu peux fermer l’écran noir sur ton téléphone et continuer ici. La page d’autorisation s’ouvrira dans ton navigateur.", "You can close the black screen on your phone and continue here. Authorization will open in your browser.", english)}</p>
          <a className="ss-btn-ghost" href="/api/tiktok/oauth/start">{t("Continuer dans le navigateur", "Continue in the browser", english)}</a>
          <button type="button" className="ss-btn-ghost" onClick={() => setShowHelp(false)}>{t("Revenir au QR", "Back to QR", english)}</button>
        </div> : <button type="button" className="ss-qr__help-link" onClick={() => setShowHelp(true)}>{t("Écran noir ou attente dans TikTok ?", "Black screen or waiting in TikTok?", english)}</button>}
        {phase === "retrying" ? <button type="button" className="ss-btn-ghost" onClick={checkNow}>{t("Vérifier maintenant", "Check now", english)}</button> : null}
        <button type="button" className="ss-btn-ghost" onClick={() => void start()}>{t("Nouveau QR", "New QR", english)}</button>
      </>}
    </div>
  );
}
