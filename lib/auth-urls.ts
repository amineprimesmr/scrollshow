import { isPaidPlan } from "./plans";

export function safeNextPath(value: string | null | undefined, fallback = "/app") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value) || value.startsWith("/login") || value.startsWith("/signup")) {
    return fallback;
  }
  return value;
}

export function isPricingPath(value: string) {
  return value === "/pricing" || value.startsWith("/pricing?") || value.startsWith("/pricing/");
}

export function afterAuthPath(plan: string | undefined, next?: string | null, onboarded = true) {
  const wanted = safeNextPath(next, "/app");
  // Preserve Stripe reconciliation after a session expires during payment.
  if (/^\/pricing\/success\?session_id=cs_[A-Za-z0-9_]+$/.test(wanted)) return wanted;
  if (!onboarded) return "/onboarding";
  if (!isPaidPlan(plan)) return "/onboarding?step=payment";
  return isPricingPath(wanted) || wanted.startsWith("/onboarding") || wanted.startsWith("/verify-email") ? "/app" : wanted;
}

export function signupUrl(opts?: {
  next?: string | null;
  mode?: "signin" | "signup" | null;
  error?: string | null;
}) {
  const params = new URLSearchParams();
  if (opts?.mode === "signin") params.set("mode", "signin");
  if (opts?.next && opts.next.startsWith("/") && !opts.next.startsWith("//")) {
    params.set("next", opts.next);
  }
  if (opts?.error) params.set("error", opts.error);
  const query = params.toString();
  return query ? `/signup?${query}` : "/signup";
}

export function googleStartUrl(opts?: {
  next?: string | null;
  mode?: "signin" | "signup" | null;
}) {
  const params = new URLSearchParams();
  if (opts?.mode === "signin") params.set("mode", "signin");
  if (opts?.next && opts.next.startsWith("/") && !opts.next.startsWith("//")) {
    params.set("next", opts.next);
  }
  const query = params.toString();
  return query ? `/api/auth/google?${query}` : "/api/auth/google";
}
