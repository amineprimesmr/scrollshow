"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { IconChevron } from "../icons";
import { useStudio } from "../StudioContext";

const TRENDING = [
  { image: "/assets/tiktoks/01-glowup-188k.png", views: "188K", likes: "12.4K" },
  { image: "/assets/tiktoks/02-foods-107k.png", views: "107K", likes: "8.2K" },
  { image: "/assets/tiktoks/03-guide-178k.png", views: "178K", likes: "9.8K" },
  { image: "/assets/tiktoks/07-pov-98k.png", views: "98K", likes: "7.2K" },
  { image: "/assets/tiktoks/05-beach-39k.png", views: "39K", likes: "2.1K" },
  { image: "/assets/tiktoks/04-marlon-65k.png", views: "65K", likes: "4.4K" },
  { image: "/assets/tiktoks/01-glowup-188k.png", views: "771K", likes: "253K" },
  { image: "/assets/tiktoks/02-foods-107k.png", views: "500K", likes: "17K" },
];

const FAQ: { section: string; items: { q: string; a: string }[] }[] = [
  {
    section: "WARMING UP YOUR ACCOUNT",
    items: [
      { q: "How do I warm up my account?", a: "Post 1–2 carousels per day for the first week. Mix formats and avoid hard CTAs early." },
      { q: "How do I navigate zero view jail?", a: "Use proven hooks from the Inspiration Library, post at consistent times, and remix trending formats." },
      { q: "What should I do in the first few weeks?", a: "Connect TikTok, run Blitz daily, schedule 3–5 posts per week, track what hooks win in Analytics." },
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
  const { posts, channels, english: ctxEnglish, setPostOpen } = useStudio();
  const [english, setEnglish] = useState(false);
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  useEffect(() => setEnglish(prefersEnglish()), []);

  const en = ctxEnglish || english;
  const connected = channels.some((c) => c.connected);
  const hasPost = posts.some((p) => p.status === "published" || p.status === "scheduled");
  const blitzDone = posts.length > 2;

  const steps = useMemo(
    () =>
      [
        { id: "blitz", label: t("Swipe du contenu dans Blitz", "Swipe content in Blitz", en), href: "/app/blitz", done: blitzDone },
        {
          id: "connect",
          label: t("Connecte ton compte", "Connect your account", en),
          href: "/app/integrations",
          done: connected,
          extra: "TikTok · IG · YT",
        },
        { id: "demo", label: t("Importe une démo", "Upload a demo video", en), href: "/app/marketplace", done: posts.some((p) => p.origin === "import") },
        {
          id: "post",
          label: t("Publie ton premier post", "Make your first post", en),
          href: "/app",
          done: hasPost,
          action: () => setPostOpen(true),
        },
      ] as Array<{
        id: string;
        label: string;
        href: string;
        done: boolean;
        extra?: string;
        action?: () => void;
      }>,
    [en, blitzDone, connected, hasPost, posts, setPostOpen],
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
            {doneCount}/4
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
        <Link href={steps.find((s) => !s.done)?.href || "/app/blitz"} className="ss-btn-purple ss-btn-wide">
          {t("Continuer la config →", "Continue setup →", en)}
        </Link>
      </div>

      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <Link href="/app/guide" className="ss-btn-ghost">
          {t("Changelog →", "Changelog →", en)}
        </Link>
      </div>

      <section className="ss-trending">
        <div className="ss-trending__head">
          <span>📈</span>
          {t("Contenu trending", "Trending Content", en)}
          <Link href="/app/library" style={{ marginLeft: "auto", fontSize: 13, color: "#52525b" }}>
            →
          </Link>
        </div>
        <div className="ss-trend-grid">
          {TRENDING.map((item, index) => (
            <Link key={index} href="/app/blitz" className="ss-trend-card">
              <img src={item.image} alt="" />
              <div className="ss-trend-card__stats">
                <span>♥ {item.likes}</span>
                <span>👁 {item.views}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

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
