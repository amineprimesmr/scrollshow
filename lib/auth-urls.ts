import { isPaidPlan } from "./plans";

export function safeNextPath(value: string | null | undefined, fallback = "/app") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/login") || value.startsWith("/signup")) {
    return fallback;
  }
  return value;
}

export function isPricingPath(value: string) {
  return value === "/pricing" || value.startsWith("/pricing?") || value.startsWith("/pricing/");
}

export function afterAuthPath(plan: string | undefined, next?: string | null, onboarded = true) {
  const dest = isPaidPlan(plan) ? safeNextPath(next, "/app") : (() => {
    const wanted = safeNextPath(next, "/pricing");
    return isPricingPath(wanted) ? wanted : "/pricing";
  })();
  // Everyone goes through onboarding once: it is where ScrollShow learns the business.
  if (!onboarded) return `/onboarding?next=${encodeURIComponent(dest)}`;
  return dest;
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
