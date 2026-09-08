"use client";
import { useEffect } from "react";
// Compatibility for emails already delivered: preserve the fragment token.
export default function LegacyVerificationRedirect() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("verify", "1");
    window.location.replace(`/signup?${params.toString()}${window.location.hash}`);
  }, []);
  return <p role="status">Retour à ton espace…</p>;
}
