"use client";
import { useEffect, useRef, useState } from "react";
import { afterAuthPath } from "@/lib/auth-urls";
import { useRouter } from "next/navigation";

export function SignupVerification({ email, token, next, onSignIn }: { email: string; token: string; next: string | null; onSignIn: () => Promise<void> }) {
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
  return <div className="ss-signup__stage" aria-busy={busy}>
    <div className="ss-signup__mail-icon" aria-hidden>✉</div>
    <h1 ref={heading} className="ss-signup__title" tabIndex={-1}>Vérifie ta boîte mail</h1>
    <p className="ss-signup__sub">{expired ? "Demande un nouveau lien pour reprendre la préparation de ton espace." : token ? "Ton lien est prêt. Confirme ton adresse pour continuer." : <>Ouvre le lien envoyé{email ? <> à <strong>{email}</strong></> : " par email"}. Tu reprendras directement la préparation de ton espace.</>}</p>
    <div className="ss-signup__notice" role="status">{message || (token ? "Ton compte et tes informations sont conservés. Si le lien a été ouvert sur un autre appareil, reconnecte-toi ici pour reprendre." : "Garde cette page ouverte : elle reprend automatiquement lorsque ton adresse est vérifiée dans ce navigateur.")}</div>
    {error && <p className="ss-signup__error" role="alert">{error}</p>}
    <button type="button" className="ss-signup__submit" disabled={busy || ((!token || expired) && cooldown > 0)} onClick={() => void submit(Boolean(token) && !expired)}>
      {busy ? "Un instant…" : token && !expired ? "Confirmer et continuer" : cooldown ? `Renvoyer dans ${cooldown} s` : "Renvoyer le lien"}
    </button>
    <button type="button" className="ss-signup__text-button" disabled={busy} onClick={() => void resume().then(ok => { if (!ok) setMessage("Pas encore confirmé ici. Ouvre le lien reçu ou reconnecte-toi si tu l’as confirmé sur un autre appareil."); })}>J’ai déjà confirmé mon adresse</button>
    <button type="button" className="ss-signup__text-button" disabled={busy} onClick={async () => { setBusy(true); try { await onSignIn(); } catch { setError("Impossible de revenir à la connexion. Réessaie."); } finally { setBusy(false); } }}>Revenir à la connexion</button>
  </div>;
}
