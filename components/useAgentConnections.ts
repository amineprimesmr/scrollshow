"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AgentConnections = {
  account: { email: string; active: boolean } | null;
  grants: { grantId: string; name: string; createdAt: string }[];
};

/** Refresh when returning from authorization; never mistake a network error for logout. */
export function useAgentConnections(initial?: AgentConnections) {
  const [connections, setConnections] = useState(initial);
  const [error, setError] = useState(false);
  const revision = useRef(0);

  const revoke = useCallback(async (grantId: string) => {
    revision.current += 1;
    try {
      const response = await fetch("/api/studio/connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantId }),
      });
      if (!response.ok) throw new Error("revocation_failed");
      const result: Pick<AgentConnections, "grants"> = await response.json();
      setConnections(previous => previous ? { ...previous, grants: result.grants } : previous);
    } finally { revision.current += 1; }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    const startedAt = Date.now();
    async function refresh() {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      const requestedRevision = revision.current;
      try {
        const response = await fetch("/api/studio/connections", { cache: "no-store", signal: controller.signal });
        const result = response.ok ? await response.json() : null;
        // A response started before a completed revocation must not restore it.
        if (requestedRevision !== revision.current) return;
        if (response.status === 401) {
          setConnections({ account: null, grants: [] });
        } else {
          if (!response.ok) throw new Error("connections_unavailable");
          setConnections(result);
        }
        setError(false);
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally { busy = false; }
    }
    void refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    // Bounded refresh also covers authorization completed in a different browser.
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt >= 120_000) window.clearInterval(timer);
      else void refresh();
    }, 5_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return { connections, error, revoke };
}
