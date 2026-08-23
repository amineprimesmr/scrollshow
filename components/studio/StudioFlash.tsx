"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function StudioFlash() {
  const params = useSearchParams();
  const [english, setEnglish] = useState(false);
  const connected = params.get("connected");
  const error = params.get("error");

  useEffect(() => {
    setEnglish(prefersEnglish());
  }, []);

  if (!connected && !error) return null;

  return (
    <p className={`ss-flash ${error ? "is-error" : ""}`}>
      {connected
        ? t("TikTok connecté. Profil, stats et posts sont disponibles.", "TikTok connected. Profile, stats, and posts are available.", english)
        : t(`Connexion TikTok : ${error}`, `TikTok connection: ${error}`, english)}
    </p>
  );
}
