"use client";
import { useEffect, useRef, useState } from "react";
import "./hero-skill.css";

const COMMAND = "set up https://scrollshow.io/SKILL.md";

/** Bloc copier-coller : l'agent installe le skill seul, l'accès reste payant. */
export function HeroSkill({ english = false }: { english?: boolean }) {
  const t = (fr: string, en: string) => (english ? en : fr);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(COMMAND);
    } catch {
      const field = document.createElement("textarea");
      field.value = COMMAND;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      try { document.execCommand("copy"); } catch { /* le lecteur copiera à la main */ }
      field.remove();
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2200);
  }

  return (
    <div className="ss-heroskill">
      <p className="ss-heroskill__label">
        {t("Donne ça à ton agent", "Give this to your agent")}
        <span className="ss-heroskill__agents" aria-hidden="true">
          <img src="/assets/platforms/tiktok.png" alt="" width={20} height={20} />
          <img src="/assets/ai/claude-transparent.png" alt="" width={20} height={20} />
          <img src="/assets/ai/codex-transparent.png" alt="" width={20} height={20} />
          <img src="/assets/ai/cursor-transparent.png" alt="" width={20} height={20} />
        </span>
      </p>
      <button type="button" className="ss-heroskill__box lg-press" onClick={() => void copy()}
        aria-label={t("Copier la commande d’installation du skill ScrollShow", "Copy the ScrollShow skill setup command")}>
        <span className="ss-heroskill__prompt" aria-hidden="true">$</span>
        <code>{COMMAND}</code>
        <span className={`ss-heroskill__copy${copied ? " is-copied" : ""}`} aria-hidden="true">
          {copied
            ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m4 12 5 5L20 6" /></svg>
            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2.5" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></svg>}
        </span>
        <span className="ss-heroskill__sr" role="status">{copied ? t("Commande copiée", "Command copied") : ""}</span>
      </button>
    </div>
  );
}
