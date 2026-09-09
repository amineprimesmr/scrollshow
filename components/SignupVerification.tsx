"use client";
import { useEffect, useRef, useState } from "react";
import { afterAuthPath } from "@/lib/auth-urls";
import { useRouter } from "next/navigation";

export function SignupVerification({ email, token, next, sent, onSignIn }: { email: string; token: string; next: string | null; sent: boolean; onSignIn: () => Promise<void> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  async function resume() {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      const { user } = await response.json();
      if (user?.emailVerified) { router.replace(afterAuthPath(user.plan, next, user.onboarded)); return true; }
    } catch {}
    return false;
  }
  useEffect(() => {
    if (token) return;
    const check = () => { if (document.visibilityState === "visible") void resume(); };
    const timer = window.setInterval(check, 15000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(timer); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [token, next]);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(value => value - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);
  async function submit(confirm: boolean) {
    if (busy || (!confirm && cooldown > 0)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth/verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(confirm ? { action: "confirm", token } : { action: "request" }) });
      if (!response.ok) {
        if (response.status === 429) { setCooldown(60); throw new Error("Trop de demandes. Patiente un instant avant de réessayer."); }
        if (response.status === 401) throw new Error("Reconnecte-toi à ton compte pour recevoir un nouveau lien.");
        if (confirm && response.status === 400) { setExpired(true); throw new Error("Ce lien a expiré ou a déjà été utilisé. Vérifie ton accès ou demande un nouveau lien."); }
        throw new Error("L’envoi est momentanément indisponible. Ton compte est conservé : réessaie dans un instant.");
      }
      if (confirm) {
        setMessage("Adresse vérifiée. Ouverture de ton espace…");
        if (!(await resume())) setMessage("Adresse vérifiée. Reconnecte-toi pour continuer.");
      } else { setCooldown(60); setMessage("Un nouveau lien vient d’être envoyé. Vérifie aussi les courriers indésirables."); }
    } catch (error) { setError(error instanceof Error ? error.message : "Connexion interrompue. Réessaie."); }
    finally { setBusy(false); }
  }
  return <div className="ss-signup__stage ss-signup__verify" aria-busy={busy}>
    <div className={`ss-signup__mail-art ${token && !expired ? "is-ready" : ""}`} aria-hidden="true">
      <span className="ss-signup__mail-orbit" />
      <svg width="42" height="42" viewBox="0 0 48 48" fill="none"><rect x="6" y="11" width="36" height="26" rx="6" stroke="currentColor" strokeWidth="2"/><path d="m8 14 13 10a5 5 0 0 0 6 0l13-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
      <span className="ss-signup__mail-badge">{token && !expired ? "✓" : "↗"}</span>
    </div>
    <p className="ss-signup__eyebrow">{token && !expired ? "Une dernière étape" : sent ? "Direction ta boîte mail" : "Compte à confirmer"}</p>
    <h1 ref={heading} className="ss-signup__title" tabIndex={-1}>{expired ? "Un nouveau lien ?" : token ? "Tu y es presque." : sent ? "Ton invitation t’attend." : "Confirme ton adresse."}</h1>
    <p className="ss-signup__sub">{expired ? "Renvoie un lien pour reprendre là où tu en étais." : token ? "Confirme ton adresse pour ouvrir ton espace." : sent ? "Clique sur le bouton de confirmation dans l’email." : "Ton compte existe déjà, il lui manque juste la confirmation. Ouvre le lien reçu à la création, ou demande-en un nouveau — aucun email ne vient d’être envoyé."}</p>
    {!token && email && <div className="ss-signup__email-tag">{email}</div>}
    {!token && !message && sent && <p className="ss-signup__waiting"><span aria-hidden="true" />En attente de confirmation</p>}
    <div role="status" aria-live="polite">{message && <p className="ss-signup__verify-status">{message}</p>}</div>
    {error && <p className="ss-signup__error" role="alert">{error}</p>}
    <button type="button" className={`ss-signup__submit ${!token || expired ? "ss-signup__resend" : ""}`} disabled={busy || ((!token || expired) && cooldown > 0)} onClick={() => void submit(Boolean(token) && !expired)}>
      {busy ? "Un instant…" : token && !expired ? "Confirmer et continuer" : cooldown ? `Renvoyer dans ${cooldown} s` : sent ? "Renvoyer le lien" : "M’envoyer un lien"}
    </button>
    <details className="ss-signup__verify-help"><summary>Besoin d’aide ?</summary>
      <p>Vérifie les indésirables. Le lien reste valable 24 heures. Cette page reprend automatiquement après confirmation dans ce navigateur.</p>
      <button type="button" className="ss-signup__text-button" disabled={busy} onClick={() => void resume().then(ok => { if (!ok) setMessage("Pas encore confirmé ici. Ouvre l’email ou reconnecte-toi si tu l’as validé sur un autre appareil."); })}>J’ai déjà confirmé mon adresse</button>
      <button type="button" className="ss-signup__text-button" disabled={busy} onClick={async () => { setBusy(true); try { await onSignIn(); } catch { setError("Impossible de revenir à la connexion. Réessaie."); } finally { setBusy(false); } }}>Changer de compte / me reconnecter</button>
    </details>
  </div>;
}
