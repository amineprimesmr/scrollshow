"use client";

import { Atmosphere } from "@/components/Atmosphere";
import { BrandMark } from "@/components/BrandMark";
import { SignupVerification } from "@/components/SignupVerification";
import { afterAuthPath, githubStartUrl, googleStartUrl, signupUrl } from "@/lib/auth-urls";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import "./signup.css";


const OAUTH_ERRORS: Record<string, string> = {
  google_not_configured: "La connexion Google est momentanément indisponible.",
  google_denied: "La connexion Google a été annulée.",
  google: "Connexion Google interrompue. Réessaie.",
  github_not_configured: "La connexion GitHub est momentanément indisponible.",
  github_denied: "La connexion GitHub a été annulée.",
  github: "Connexion GitHub interrompue. Vérifie qu’une adresse email vérifiée est associée à ton compte GitHub.",
};

function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

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
  const queryError = OAUTH_ERRORS[params.get("error") || ""] || "";
  const [step, setStep] = useState<"email" | "password" | "verification">("email");
  const [verificationToken, setVerificationToken] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);
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
      if (json.user && !(params.get("verify") === "1" && !json.user.emailVerified)) router.replace(afterAuthPath(json.user.plan, next, json.user.onboarded));
      else if (json.user) { setEmail(json.user.email); setStep("verification"); }
      else if (params.get("verify") === "1") setStep("verification");
    }).catch(() => {}).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [router, next, params]);

  const oauthOptions = useMemo(
    () => ({ next: next || "/app", mode: signin ? ("signin" as const) : null }),
    [next, signin],
  );
  const googleHref = useMemo(() => googleStartUrl(oauthOptions), [oauthOptions]);
  const githubHref = useMemo(() => githubStartUrl(oauthOptions), [oauthOptions]);

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
            ? "Ce compte utilise Google. Continue avec Google."
            : json.error === "github"
              ? "Ce compte utilise GitHub. Continue avec GitHub."
              : "Adresse email ou mot de passe incorrect.",
        );
        return;
      }
      if (!res.ok) {
        setError("Connexion impossible. Réessaie dans un instant.");
        return;
      }
      router.replace(afterAuthPath(json.user?.plan, next, json.user?.onboarded !== false));
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
    setPassword(""); setVerificationSent(true); setStep("verification");
  }

  const badge = step === "verification" ? "Confirmation" : signin ? "Connexion" : "Création de compte";
  const title = step === "verification"
    ? "Plus qu'une étape"
    : signin
      ? "Ravi de te retrouver"
      : step === "password"
        ? "Sécurise ton compte"
        : "Créer ton espace";

  return (
    <main className="ss-signup">
      <Atmosphere />
      <div className="ss-signup__noise" aria-hidden />

      <section className="ss-signup__hero">
        <Link href="/" className="ss-signup__badge-wrap" aria-label="ScrollShow, accueil">
          <span className="ss-signup__badge-glow" aria-hidden />
          <span className="ss-signup__badge">
            <span className="ss-signup__badge-spin" aria-hidden />
            <span className="ss-signup__badge-label">
              <BrandMark size={15} />
              {badge}
            </span>
          </span>
        </Link>

        <h1 className="ss-signup__title">{title}</h1>

        <div className="ss-signup__shell">
          <div className="ss-signup__card">
            <span className="ss-signup__card-edge" aria-hidden />
            <span className="ss-signup__card-glow" aria-hidden />

            {checking ? (
              <div className="ss-signup__stage" role="status">
                <p className="ss-signup__sub">Préparation de ton espace…</p>
              </div>
            ) : step === "verification" ? (
              <SignupVerification
                email={email}
                token={verificationToken}
                next={next}
                sent={verificationSent}
                onSignIn={async () => {
                  const response = await fetch("/api/auth/logout", { method: "POST" });
                  if (!response.ok) throw new Error("Déconnexion indisponible. Réessaie.");
                  capturedToken.current = "";
                  setVerificationToken("");
                  setStep("email");
                  setError("");
                  router.replace(signupUrl({ next, mode: "signin" }));
                }}
              />
            ) : (
              <form className="ss-signup__stage" key={`${signin}-${step}`} onSubmit={onSubmit} aria-busy={pending}>
                <p className="ss-signup__sub">
                  {signin ? (
                    <>Pas encore de compte ? <Link href={signupUrl({ next })}>Créer mon espace</Link>.</>
                  ) : step === "password" ? (
                    "Un mot de passe, puis on prépare ton espace ensemble."
                  ) : (
                    <>Déjà un compte ? <Link href={signupUrl({ next, mode: "signin" })}>Me connecter</Link>.</>
                  )}
                </p>

                {!signin && step === "password" ? (
                  <div className="ss-signup__identity">
                    <span>{email}</span>
                    <button type="button" className="ss-signup__text-button" disabled={pending} onClick={() => { setStep("email"); setError(""); }}>
                      Modifier
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="ss-signup__providers">
                      <a className="ss-signup__google" href={googleHref}>
                        <GoogleMark />
                        Google
                      </a>
                      <a className="ss-signup__google" href={githubHref}>
                        <GithubMark />
                        GitHub
                      </a>
                    </div>
                    <div className="ss-signup__or">ou</div>
                  </>
                )}

                {signin || step === "email" ? (
                  <div className="ss-signup__field">
                    <div className="ss-signup__field-head">
                      <label htmlFor="signup-email">Email</label>
                    </div>
                    <div className="ss-signup__ring">
                      <span className="ss-signup__ring-spin" aria-hidden />
                      <input
                        id="signup-email"
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="toi@exemple.fr"
                        disabled={pending}
                        autoFocus
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                      />
                    </div>
                  </div>
                ) : null}

                {signin || step === "password" ? (
                  <div className="ss-signup__field">
                    <div className="ss-signup__field-head">
                      <label htmlFor="signup-password">Mot de passe</label>
                      {signin ? (
                        <Link href="/recover" className="ss-signup__text-button">Mot de passe oublié ?</Link>
                      ) : (
                        <button type="button" className="ss-signup__text-button" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>
                          {showPassword ? "Masquer" : "Afficher"}
                        </button>
                      )}
                    </div>
                    <div className="ss-signup__ring">
                      <span className="ss-signup__ring-spin" aria-hidden />
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
                    </div>
                  </div>
                ) : null}

                {error || queryError ? <p className="ss-signup__error" role="alert">{error || queryError}</p> : null}

                <button className="ss-signup__submit" type="submit" disabled={pending}>
                  {pending ? "Un instant…" : signin ? "Me connecter" : step === "email" ? "Continuer" : "Créer mon compte"}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <p className="ss-signup__foot">
        {signin ? "En te connectant, tu acceptes nos " : "En créant ton compte, tu acceptes nos "}
        <Link href="/cgu">conditions</Link> et notre <Link href="/confidentialite">politique de confidentialité</Link>.
      </p>
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
