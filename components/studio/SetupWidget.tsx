"use client";

import { t } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { IconCheck, IconX } from "./icons";
import { useStudio } from "./StudioContext";
import { Metal } from "@/components/fx/Metal";

const KEY = "ss-setup-collapsed";

/** Stripe-style setup guide: a floating pill that expands into the checklist. */
export function SetupWidget() {
  const { posts, channels, english: en } = useStudio();
  const [open, setOpen] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [usProgress, setUsProgress] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(KEY) === "1");
    } catch {
      /* ignore */
    }
    fetch("/api/keys")
      .then((res) => res.json())
      .then((data) => setHasKey((data.keys || []).length > 0))
      .catch(() => {});
    fetch("/api/studio/us-guide")
      .then((res) => res.json())
      .then((data) => setUsProgress((data.done || []).length))
      .catch(() => {});
  }, []);

  const steps = useMemo(
    () => [
      { id: "connect", label: t("Connecte tes comptes TikTok", "Connect your TikTok accounts", en), href: "/app/integrations", done: channels.some((c) => c.connected) },
      { id: "mcp", label: t("Connecte le MCP à ton IA", "Connect MCP to your AI", en), href: "/app/mcp", done: hasKey },
      { id: "post", label: t("Crée et publie depuis ton IA", "Create and publish from your AI", en), href: "/app/mcp", done: posts.some((p) => p.origin === "ai") },
      { id: "us", label: t("Prépare ton compte pour les US", "Prepare your account for the US", en), href: "/app/post-us", done: usProgress > 0 },
    ],
    [channels, posts, hasKey, usProgress, en],
  );
  const done = steps.filter((s) => s.done).length;
  const all = done === steps.length;
  const pct = Math.round((done / steps.length) * 100);

  if (all || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(KEY, "1"); // hidden for this visit only, back next time
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={`ss-setup ${open ? "is-open" : ""}`}>
      <div className="ss-setup__card" aria-hidden={!open}>
        <div className="ss-setup__head">
          <div>
            <b>{t("Configuration", "Setup guide", en)}</b>
            <span>
              {done}/{steps.length} {t("étapes", "steps", en)}
            </span>
          </div>
          <button type="button" className="ss-setup__close" onClick={dismiss} aria-label={t("Masquer", "Hide", en)}>
            <IconX size={14} />
          </button>
        </div>
        <div className="ss-setup__bar">
          <i style={{ width: `${pct}%` }} />
        </div>
        <ul className="ss-setup__steps">
          {steps.map((step, i) => (
            <li key={step.id} className={step.done ? "is-done" : ""} style={{ transitionDelay: `${40 + i * 35}ms` }}>
              <Link href={step.href} onClick={() => setOpen(false)}>
                <span className="ss-setup__check">{step.done ? <IconCheck size={12} /> : null}</span>
                {step.label}
                <span className="ss-setup__arrow">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <Metal preset="chromatic" strength={0.7} className="ss-setup__metal">
        <button type="button" className="ss-setup__pill" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <svg className="ss-setup__ring" viewBox="0 0 36 36" aria-hidden>
            <circle cx="18" cy="18" r="15.5" />
            <circle cx="18" cy="18" r="15.5" style={{ strokeDasharray: `${pct} 100` }} />
          </svg>
          <span>
            {t("Configuration", "Setup", en)} · {done}/{steps.length}
          </span>
        </button>
      </Metal>
    </div>
  );
}
