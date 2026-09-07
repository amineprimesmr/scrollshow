"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnalyticsView } from "./AnalyticsView";
import { useStudio } from "../StudioContext";

export function HomeView() {
  const { posts, channels, english: ctxEnglish } = useStudio();
  const [english, setEnglish] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [usProgress, setUsProgress] = useState(0);

  useEffect(() => setEnglish(prefersEnglish()), []);

  useEffect(() => {
    fetch("/api/studio/us-guide")
      .then((res) => res.json())
      .then((data) => setUsProgress((data.done || []).length))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/keys")
      .then((res) => res.json())
      .then((data) => setHasKey((data.keys || []).length > 0))
      .catch(() => {});
  }, []);

  const en = ctxEnglish || english;
  const connected = channels.some((c) => c.connected);
  const hasAiPost = posts.some((p) => p.origin === "ai");

  const steps = useMemo(
    () =>
      [
        {
          id: "connect",
          label: t("Connecte tes comptes TikTok", "Connect your TikTok accounts", en),
          href: "/app/integrations",
          done: connected,
        },
        {
          id: "mcp",
          label: t("Connecte le MCP à ton IA", "Connect MCP to your AI", en),
          href: "/app/mcp",
          done: hasKey,
        },
        {
          id: "post",
          label: t("Crée et publie depuis ton IA", "Create and publish from your AI", en),
          href: "/app/mcp",
          done: hasAiPost,
        },
        {
          id: "us",
          label: t("Prépare ton compte pour les US", "Prepare your account for the US", en),
          href: "/app/post-us",
          done: usProgress > 0,
          extra: usProgress > 0 ? undefined : t("guide + checklist", "guide + checklist", en),
        },
      ] as Array<{
        id: string;
        label: string;
        href: string;
        done: boolean;
        extra?: string;
        action?: () => void;
      }>,
    [en, connected, hasKey, hasAiPost, usProgress],
  );

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="ss-home">
      <div className="ss-home-hero">
        <div className="ss-home-hero__logo" aria-hidden>
          <span /><span /><span />
        </div>
        <h1>{t("Overview", "Overview", en)}</h1>
        <p className="ss-home-hero__sub">{t("Ton état des lieux : configuration, portée et posts.", "Your at-a-glance state: setup, reach and posts.", en)}</p>
      </div>

      <div className="ss-quickstart">
        <div className="ss-quickstart__head">
          <h2>{t("Démarrage rapide", "Quickstart", en)}</h2>
          <span>
            {doneCount}/{steps.length}
          </span>
        </div>
        <p>{t("Complète ces étapes pour tirer le max de ScrollShow.", "Complete these to get the most out of ScrollShow.", en)}</p>
        <ul className="ss-checklist">
          {steps.map((step) => (
            <li key={step.id} className={step.done ? "is-done" : ""}>
              {step.action ? (
                <button type="button" onClick={step.action}>
                  <span className="ss-check-circle">{step.done ? "✓" : ""}</span>
                  {step.label}
                  {step.extra ? <small style={{ marginLeft: 8, color: "var(--ss-muted-2)" }}>{step.extra}</small> : null}
                  <span>→</span>
                </button>
              ) : (
                <Link href={step.href}>
                  <span className="ss-check-circle">{step.done ? "✓" : ""}</span>
                  {step.label}
                  {step.extra ? <small style={{ marginLeft: 8, color: "var(--ss-muted-2)" }}>{step.extra}</small> : null}
                  <span>→</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
        <Link href={steps.find((s) => !s.done)?.href || "/app"} className="ss-btn-purple ss-btn-wide">
          {t("Continuer la config →", "Continue setup →", en)}
        </Link>
      </div>

      <section className="ss-home-analytics">
        <AnalyticsView embedded />
      </section>
    </div>
  );
}
