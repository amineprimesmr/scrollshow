"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { IconChevron } from "../icons";
import { useStudio } from "../StudioContext";

const FAQ: { section: string; items: { q: string; a: string }[] }[] = [
  {
    section: "WARMING UP YOUR ACCOUNT",
    items: [
      { q: "How do I warm up my account?", a: "Post 1–2 carousels per day for the first week. Mix formats and avoid hard CTAs early." },
      { q: "How do I navigate zero view jail?", a: "Browse the Marketplace for proven formats, post at consistent times, and remix what's working." },
      { q: "What should I do in the first few weeks?", a: "Connect TikTok, schedule 3–5 posts per week, track what hooks win in Analytics." },
      { q: "Why are my first posts getting low views?", a: "New accounts need trust. Warm up with native formats before pushing product CTAs." },
    ],
  },
  {
    section: "WHY THIS TYPE OF CONTENT",
    items: [
      { q: "Why slideshows?", a: "High save rate, easy to remix, perfect for listicles and glow-up narratives on TikTok." },
      { q: "Why wall of text?", a: "Hooks stop the scroll. Pair emotional copy with a strong visual in slide 1." },
      { q: "Why hook + demo?", a: "Shows the product in context. Best for apps and e-commerce with a clear before/after." },
    ],
  },
  {
    section: "CREATING AND REMIXING CONTENT",
    items: [
      { q: "How does Remix work?", a: "Import a trending TikTok, reconstruct editable text layers, swap copy and schedule." },
      { q: "Can I edit imported TikToks?", a: "Yes — run Reconstruct to split background and text overlays, then edit in the carousel editor." },
      { q: "What if generation fails?", a: "Retry reconstruct, or edit slides manually in Content → open any draft." },
    ],
  },
  {
    section: "ACCOUNTS AND WORKSPACES",
    items: [
      { q: "Which accounts can I connect?", a: "TikTok (live publish), Instagram, Facebook, and X for scheduling." },
      { q: "What's the difference between account types?", a: "Creator accounts unlock analytics; Business accounts unlock ads API on some platforms." },
    ],
  },
];

export function HomeView() {
  const { posts, channels, english: ctxEnglish } = useStudio();
  const [english, setEnglish] = useState(false);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => setEnglish(prefersEnglish()), []);

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
      ] as Array<{
        id: string;
        label: string;
        href: string;
        done: boolean;
        extra?: string;
        action?: () => void;
      }>,
    [en, connected, hasKey, hasAiPost],
  );

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="ss-home">
      <div className="ss-home-hero">
        <div className="ss-home-hero__logo" aria-hidden>
          <span /><span /><span />
        </div>
        <h1>{t("Fais voir ton produit.", "Let's get your product seen.", en)}</h1>
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
                  {step.extra ? <small style={{ marginLeft: 8, color: "#a1a1aa" }}>{step.extra}</small> : null}
                  <span>→</span>
                </button>
              ) : (
                <Link href={step.href}>
                  <span className="ss-check-circle">{step.done ? "✓" : ""}</span>
                  {step.label}
                  {step.extra ? <small style={{ marginLeft: 8, color: "#a1a1aa" }}>{step.extra}</small> : null}
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

      <section className="ss-faq">
        <h2>❓ {t("Questions fréquentes", "Frequently Asked Questions", en)}</h2>
        <div className="ss-faq-grid">
          {FAQ.map((block) => (
            <div key={block.section} className="ss-faq-section">
              <h3>{block.section}</h3>
              {block.items.map((item) => {
                const key = `${block.section}-${item.q}`;
                const open = openFaq === key;
                return (
                  <div key={key} className="ss-faq-item">
                    <button type="button" onClick={() => setOpenFaq(open ? null : key)}>
                      {item.q}
                      <IconChevron dir={open ? "down" : "right"} size={16} />
                    </button>
                    {open ? <p>{item.a}</p> : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
