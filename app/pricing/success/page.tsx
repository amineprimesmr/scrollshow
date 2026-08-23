"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

function SuccessInner() {
  const params = useSearchParams();

  useEffect(() => {
    const sessionId = params.get("session_id");
    window.location.replace(sessionId ? `/api/stripe/sync?session_id=${encodeURIComponent(sessionId)}` : "/pricing");
  }, [params]);

  return <main className="mx-auto flex min-h-screen items-center justify-center px-6">Activation…</main>;
}

export default function PricingSuccessPage() {
  return (
    <Suspense>
      <SuccessInner />
    </Suspense>
  );
}
