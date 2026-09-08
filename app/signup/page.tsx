"use client";

import { BrandMark } from "@/components/BrandMark";
import { SignupVerification } from "@/components/SignupVerification";
import { afterAuthPath, googleStartUrl, signupUrl } from "@/lib/auth-urls";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import "./signup.css";

const SETUP_STEPS = [
  { title: "1. Crée ton compte", text: "Avec Google ou ton adresse email. Aucune carte demandée à cette étape." },
  { title: "2. Prépare ton espace", text: "Présente ton activité et personnalise ton profil. Le branchement de ton assistant peut attendre." },
  { title: "3. Active ton accès", text: "Choisis ton offre à la fin de l’onboarding. Paiement sécurisé sur Stripe, puis accès au studio." },
];

const GOOGLE_ERRORS: Record<string, string> = {
  google_not_configured: "La connexion Google est momentanément indisponible.",
  google_denied: "La connexion Google a été annulée.",
  google: "Connexion Google interrompue. Réessaie.",
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function nameFromEmail(email: string) {
  const raw = email.split("@")[0] || "Creator";
  return raw
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .slice(0, 40);
}

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const signin = params.get("mode") === "signin";
  const next = params.get("next");
  const queryError = GOOGLE_ERRORS[params.get("error") || ""] || "";
  const [step, setStep] = useState<"email" | "password" | "verification">("email");
  const [verificationToken, setVerificationToken] = useState("");
  const capturedToken = useRef<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let active = true;
    const token = capturedToken.current ?? (new URLSearchParams(window.location.hash.slice(1)).get("token") || "");
    capturedToken.current = token;
    if (token) {
      setVerificationToken(token); setStep("verification"); setChecking(false);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      return;
    }
    fetch("/api/auth/me").then(r => r.json()).then(json => {
      if (!active) return;
      if (json.user?.emailVerified) router.replace(afterAuthPath(json.user.plan, next, json.user.onboarded));
      else if (json.user) { setEmail(json.user.email); setStep("verification"); }
      else if (params.get("verify") === "1") setStep("verification");
    }).catch(() => {}).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [router, next, params]);

  const googleHref = useMemo(
    () => googleStartUrl({ next: next || "/app", mode: signin ? "signin" : null }),
    [next, signin],
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!signin && step === "email") {
      setStep("password");
      return;
    }

    setPending(true);
    let res: Response;
    try { res = await fetch(signin ? "/api/auth/login" : "/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        signin
          ? { email, password }
          : { name: nameFromEmail(email), email, password },
      ),
    }); } catch { setPending(false); setError("Connexion interrompue. Réessaie, tes informations sont conservées."); return; }
    const json = await res.json().catch(() => ({}));
    setPending(false);
    if (signin) {
      if (res.status === 401) {
        setError(
          json.error === "google"
            ? "Utilise « Continuer avec Google » pour ce compte."
            : "Adresse email ou mot de passe incorrect.",
        );
        return;
      }
      if (!res.ok) {
        setError("Connexion impossible. Réessaie dans un instant.");
        return;
      }
      if (json.user?.emailVerified) router.replace(afterAuthPath(json.user.plan, next, json.user.onboarded !== false));
      else { setPassword(""); setStep("verification"); }
      return;
    }
    if (res.status === 409) {
      setError("Un compte existe déjà avec cette adresse. Connecte-toi pour reprendre.");
      return;
    }
    if (!res.ok) {
      setError(res.status === 503 ? "L’envoi d’emails est momentanément indisponible. Réessaie plus tard." : "Utilise une adresse valide et un mot de passe d’au moins 8 caractères.");
      return;
    }
    setPassword(""); setStep("verification");
  }

  return (
    <main className="ss-signup">
      <section className="ss-signup__form-col">
        <div className="ss-signup__form">
          <Link href="/" className="ss-signup__brand">
            <BrandMark size={28} />
            ScrollShow
          </Link>
          {checking ? <div className="ss-signup__stage" role="status"><p className="ss-signup__sub">Préparation de ton espace…</p></div> : step === "verification" ? <SignupVerification email={email} token={verificationToken} next={next} onSignIn={async () => { const response = await fetch("/api/auth/logout", { method: "POST" }); if (!response.ok) throw new Error("Déconnexion indisponible. Réessaie."); capturedToken.current = ""; setVerificationToken(""); setStep("email"); setError(""); router.replace(signupUrl({ next, mode: "signin" })); }} /> : <form className="ss-signup__stage" key={`${signin}-${step}`} onSubmit={onSubmit} aria-busy={pending}>
          <h1 className="ss-signup__title">
            {signin ? "Ravi de te retrouver" : step === "password" ? "Sécurise ton compte" : "Crée ton espace ScrollShow"}
          </h1>
          <p className="ss-signup__sub">
            {signin ? "Connecte-toi pour reprendre là où tu en étais." : step === "password" ? "Un mot de passe, puis on prépare ton espace ensemble." : "Ton compte d’abord. Ton espace personnalisé ensuite."}
          </p>

          {!signin && step === "password" ? (
            <div className="ss-signup__or" style={{ marginTop: 28 }}>
              {email}
              <button type="button" className="ss-signup__text-button" disabled={pending} onClick={() => { setStep("email"); setError(""); }}>Modifier</button>
            </div>
          ) : (
            <>
              <a className="ss-signup__google" href={googleHref}>
                <GoogleMark />
                Continuer avec Google
              </a>
              <div className="ss-signup__or">ou</div>
            </>
          )}

          {signin || step === "email" ? (
            <>
              <label htmlFor="signup-email">Email</label>
              <input
                id="signup-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="toi@exemple.fr"
                disabled={pending}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </>
          ) : null}

          {signin || step === "password" ? (
            <>
              <label htmlFor="signup-password" style={signin ? { marginTop: 16 } : undefined}>
                Mot de passe
              </label>
              <input
                id="signup-password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={signin ? 1 : 8}
                autoComplete={signin ? "current-password" : "new-password"}
                placeholder={signin ? "Ton mot de passe" : "8 caractères minimum"}
                disabled={pending}
                autoFocus={!signin}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button type="button" className="ss-signup__text-button" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? "Masquer" : "Afficher"} le mot de passe</button>
            </>
          ) : null}

          {error || queryError ? <p className="ss-signup__error" role="alert">{error || queryError}</p> : null}
          {signin && <p><Link href="/recover">Mot de passe oublié ?</Link></p>}
          <button className="ss-signup__submit" type="submit" disabled={pending}>
            {pending ? "Un instant…" : signin ? "Me connecter" : step === "email" ? "Continuer avec mon email" : "Créer mon compte"}
          </button>
          <p className="ss-signup__foot">
            {signin ? (
              <>
                Pas encore de compte ? <Link href={signupUrl({ next })}>Créer mon espace</Link>
              </>
            ) : (
              <>
                Déjà un compte ?{" "}
                <Link href={signupUrl({ next, mode: "signin" })}>Me connecter</Link>
              </>
            )}
          </p>
        </form>}
        </div>
      </section>

      <aside className="ss-signup__proof" aria-hidden>
        <div className="ss-signup__panel">
          <h2>Ton espace, étape par étape.</h2>
          <div className="ss-signup__quotes">
            {SETUP_STEPS.map(step => <article key={step.title} className="ss-quote">
              <h3>{step.title}</h3><p>{step.text}</p>
            </article>)}
          </div>
        </div>
      </aside>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
