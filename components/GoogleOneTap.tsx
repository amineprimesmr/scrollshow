"use client";

import { useEffect } from "react";

type Credential = { credential?: string };

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: Record<string, unknown>) => void;
          prompt: () => void;
          cancel: () => void;
        };
      };
    };
  }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

function loadScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("gsi")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("gsi"));
    document.head.appendChild(script);
  });
}

/**
 * Invite Google One Tap sur la landing : connecte en un tap les visiteurs
 * deja connectes a Google, sans quitter la page. Silencieux si l'OAuth Google
 * n'est pas configure ou si le visiteur a deja une session ScrollShow.
 */
export function GoogleOneTap({ next }: { next?: string }) {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/auth/google/one-tap", { cache: "no-store" });
        const config = (await res.json()) as { enabled?: boolean; clientId?: string; nonce?: string };
        if (cancelled || !config.enabled || !config.clientId || !config.nonce) return;

        await loadScript();
        if (cancelled || !window.google?.accounts?.id) return;

        window.google.accounts.id.initialize({
          client_id: config.clientId,
          nonce: config.nonce,
          use_fedcm_for_prompt: true,
          cancel_on_tap_outside: false,
          context: "signup",
          callback: async (response: Credential) => {
            if (!response.credential) return;
            const auth = await fetch("/api/auth/google/one-tap", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credential: response.credential, next: next ?? null }),
            });
            if (!auth.ok) return;
            const data = (await auth.json()) as { redirect?: string };
            window.location.assign(data.redirect || "/app");
          },
        });
        window.google.accounts.id.prompt();
      } catch {
        // One Tap est un raccourci : on retombe sur le bouton Google du signup.
      }
    })();

    return () => {
      cancelled = true;
      window.google?.accounts?.id?.cancel();
    };
  }, [next]);

  return null;
}
