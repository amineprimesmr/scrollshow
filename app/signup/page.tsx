"use client";

import { BrandMark } from "@/components/BrandMark";
import { afterAuthPath, googleStartUrl, signupUrl } from "@/lib/auth-urls";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import "./signup.css";

const QUOTES = [
  {
    metric: "+100M $",
    label: "CA generated",
    text: "By far the most powerful tool available. You instantly see who's scaling and which ads are crushing. I use it every day, can't go without it",
    name: "Fouad Juliene",
    role: "Founder of Maybe Paris",
    avatar: "/assets/avatars/gars1.png",
    mark: "MP",
  },
  {
    metric: "+20M$",
    label: "CA generated",
    text: "Love the fact that I can match ads to landing pages. It's super useful to see how brands structure their funnels.",
    name: "Alex Shane",
    role: "Founder of Fincut",
    avatar: "/assets/avatars/leo.png",
    mark: "F",
  },
  {
    metric: "+200M$",
    label: "CA generated",
    text: "ScrollShow helps you see what's working for other brands so you can easily create high-converting ads for yours. A must-have for anyone serious about scaling.",
    name: "Nick Theriot",
    role: "Founder of Theriot Solutions",
    avatar: "/assets/avatars/estebanprime.png",
    mark: "TS",
  },
];

const GOOGLE_ERRORS: Record<string, string> = {
  google_not_configured: "Google sign-in is not configured yet.",
  google_denied: "Google sign-in was cancelled.",
  google: "Could not sign in with Google. Try again.",
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
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const googleHref = useMemo(
    () => googleStartUrl({ next: next || (signin ? null : "/pricing"), mode: signin ? "signin" : null }),
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
    const res = await fetch(signin ? "/api/auth/login" : "/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        signin
          ? { email, password }
          : { name: nameFromEmail(email), email, password },
      ),
    });
    const json = await res.json().catch(() => ({}));
    setPending(false);
    if (signin) {
      if (res.status === 401) {
        setError(
          json.error === "google"
            ? "Use Continue with Google for this account."
            : "Incorrect email or password.",
        );
        return;
      }
      if (!res.ok) {
        setError("Could not sign in. Try again.");
        return;
      }
      router.push(afterAuthPath(json.user?.plan, next));
      return;
    }
    if (res.status === 409) {
      setError("An account already exists with this email.");
      return;
    }
    if (!res.ok) {
      setError("Use a valid email and a password with at least 8 characters.");
      return;
    }
    router.push(afterAuthPath(json.user?.plan, next || "/pricing"));
  }

  return (
    <main className="ss-signup">
      <section className="ss-signup__form-col">
        <form className="ss-signup__form" onSubmit={onSubmit}>
          <Link href="/" className="ss-signup__brand">
            <BrandMark size={28} />
            ScrollShow
          </Link>
          <h1 className="ss-signup__title">
            {signin ? "Sign in to ScrollShow" : "Create your ScrollShow Account"}
          </h1>
          <p className="ss-signup__sub">
            {signin ? "Welcome back. Pick up where you left off." : "Choose a plan next. 3-day trial, then subscribe to open the studio."}
          </p>

          {!signin && step === "password" ? (
            <div className="ss-signup__or" style={{ marginTop: 28 }}>
              {email}
            </div>
          ) : (
            <>
              <a className="ss-signup__google" href={googleHref}>
                <GoogleMark />
                Continue with Google
              </a>
              <div className="ss-signup__or">Or</div>
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
                placeholder="your@email.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </>
          ) : null}

          {signin || step === "password" ? (
            <>
              <label htmlFor="signup-password" style={signin ? { marginTop: 16 } : undefined}>
                Password
              </label>
              <input
                id="signup-password"
                name="password"
                type="password"
                required
                minLength={signin ? 1 : 8}
                autoComplete={signin ? "current-password" : "new-password"}
                placeholder={signin ? "Your password" : "8+ characters"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </>
          ) : null}

          {error || queryError ? <p className="ss-signup__error">{error || queryError}</p> : null}
          <button className="ss-signup__submit" type="submit" disabled={pending}>
            {pending ? "…" : signin ? "Sign in" : step === "email" ? "Continue with Email" : "Create account"}
          </button>
          <p className="ss-signup__foot">
            {signin ? (
              <>
                Don&apos;t have an account? <Link href={signupUrl({ next })}>Sign up</Link>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Link href={signupUrl({ next, mode: "signin" })}>Sign in</Link>
              </>
            )}
          </p>
        </form>
      </section>

      <aside className="ss-signup__proof" aria-hidden>
        <div className="ss-signup__panel">
          <h2>Ready to build a multi-million dollar brand?</h2>
          <div className="ss-signup__quotes">
            {QUOTES.map((quote) => (
              <article key={quote.name} className="ss-quote">
                <div className="ss-quote__metric">
                  <b>{quote.metric}</b> {quote.label}
                </div>
                <blockquote>“{quote.text}”</blockquote>
                <div className="ss-quote__who">
                  <img src={quote.avatar} alt="" />
                  <div>
                    <strong>{quote.name}</strong>
                    <span>{quote.role}</span>
                  </div>
                  <span className="ss-quote__mark">{quote.mark}</span>
                </div>
              </article>
            ))}
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
