"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { IconChevron } from "../icons";
import { useStudio } from "../StudioContext";

type FaqItem = { q: { fr: string; en: string }; a: { fr: string; en: string } };
type FaqBlock = { section: { fr: string; en: string }; items: FaqItem[] };

const FAQ: FaqBlock[] = [
  {
    section: { fr: "Chauffer ton compte", en: "Warming up your account" },
    items: [
      {
        q: { fr: "Comment chauffer mon compte ?", en: "How do I warm up my account?" },
        a: {
          fr: "Publie 1 à 2 carrousels par jour la première semaine. Varie les formats et évite les CTA agressifs au début.",
          en: "Post 1–2 carousels per day for the first week. Mix formats and avoid hard CTAs early.",
        },
      },
      {
        q: { fr: "Comment sortir de la prison à zéro vue ?", en: "How do I navigate zero view jail?" },
        a: {
          fr: "Pioche des formats qui ont fait leurs preuves dans la Bibliothèque, publie à heures fixes et remixe ce qui marche.",
          en: "Browse the Library for proven formats, post at consistent times, and remix what's working.",
        },
      },
      {
        q: { fr: "Que faire les premières semaines ?", en: "What should I do in the first few weeks?" },
        a: {
          fr: "Connecte TikTok, planifie 3 à 5 posts par semaine, et regarde dans Analytics quels hooks gagnent.",
          en: "Connect TikTok, schedule 3–5 posts per week, track what hooks win in Analytics.",
        },
      },
      {
        q: { fr: "Pourquoi mes premiers posts font peu de vues ?", en: "Why are my first posts getting low views?" },
        a: {
          fr: "Un compte neuf doit gagner la confiance de l'algorithme. Chauffe-le avec des formats natifs avant de pousser ton produit.",
          en: "New accounts need trust. Warm up with native formats before pushing product CTAs.",
        },
      },
      {
        q: { fr: "Comment toucher le public US depuis la France ?", en: "How do I reach the US audience from abroad?" },
        a: {
          fr: "Deux méthodes : contenu 100 % anglais publié aux heures de New York, ou un iPhone US dédié avec ton propre VPN Outline. Le guide complet est dans Poster aux US.",
          en: "Two methods: 100% English content posted on New York time, or a dedicated US iPhone with your own Outline VPN. The full guide is under Post to the US.",
        },
      },
    ],
  },
  {
    section: { fr: "Pourquoi ce type de contenu", en: "Why this type of content" },
    items: [
      {
        q: { fr: "Pourquoi des diaporamas ?", en: "Why slideshows?" },
        a: {
          fr: "Taux de sauvegarde élevé, faciles à remixer, parfaits pour les listes et les récits de glow-up sur TikTok.",
          en: "High save rate, easy to remix, perfect for listicles and glow-up narratives on TikTok.",
        },
      },
      {
        q: { fr: "Pourquoi un mur de texte ?", en: "Why wall of text?" },
        a: {
          fr: "Le hook arrête le scroll. Associe une phrase émotionnelle à un visuel fort dès la slide 1.",
          en: "Hooks stop the scroll. Pair emotional copy with a strong visual in slide 1.",
        },
      },
      {
        q: { fr: "Pourquoi hook + démo ?", en: "Why hook + demo?" },
        a: {
          fr: "Montre le produit en contexte. Idéal pour les apps et l'e-commerce avec un avant/après clair.",
          en: "Shows the product in context. Best for apps and e-commerce with a clear before/after.",
        },
      },
    ],
  },
  {
    section: { fr: "Créer et remixer", en: "Creating and remixing content" },
    items: [
      {
        q: { fr: "Comment marche le Remix ?", en: "How does Remix work?" },
        a: {
          fr: "Importe un TikTok qui cartonne, reconstruis les calques de texte, change le texte et planifie.",
          en: "Import a trending TikTok, reconstruct editable text layers, swap copy and schedule.",
        },
      },
      {
        q: { fr: "Je peux modifier un TikTok importé ?", en: "Can I edit imported TikToks?" },
        a: {
          fr: "Oui : lance Reconstruire pour séparer le fond et les textes, puis édite dans l'éditeur de carrousel.",
          en: "Yes — run Reconstruct to split background and text overlays, then edit in the carousel editor.",
        },
      },
      {
        q: { fr: "Et si la génération échoue ?", en: "What if generation fails?" },
        a: {
          fr: "Relance la reconstruction, ou édite les slides à la main depuis n'importe quel brouillon.",
          en: "Retry reconstruct, or edit slides manually from any draft.",
        },
      },
    ],
  },
  {
    section: { fr: "Comptes et espaces", en: "Accounts and workspaces" },
    items: [
      {
        q: { fr: "Quels comptes je peux connecter ?", en: "Which accounts can I connect?" },
        a: {
          fr: "TikTok (publication directe), Instagram, Facebook et X pour la planification.",
          en: "TikTok (live publish), Instagram, Facebook, and X for scheduling.",
        },
      },
      {
        q: { fr: "Quelle différence entre les types de compte ?", en: "What's the difference between account types?" },
        a: {
          fr: "Les comptes Creator débloquent les analytics ; les comptes Business débloquent l'API pub sur certaines plateformes.",
          en: "Creator accounts unlock analytics; Business accounts unlock ads API on some platforms.",
        },
      },
      {
        q: { fr: "C'est quoi un compte warmé ?", en: "What is a warmed account?" },
        a: {
          fr: "Un compte TikTok ou Instagram US/EU chauffé sur un vrai téléphone, livré prêt à connecter à ScrollShow. Voir Comptes warmés.",
          en: "A US/EU TikTok or Instagram account warmed on a real phone, delivered ready to connect to ScrollShow. See Warmed Accounts.",
        },
      },
    ],
  },
];

export function HomeView() {
  const { posts, channels, english: ctxEnglish } = useStudio();
  const [english, setEnglish] = useState(false);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
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
            <div key={block.section.en} className="ss-faq-section">
              <h3>{t(block.section.fr, block.section.en, en)}</h3>
              {block.items.map((item) => {
                const key = `${block.section.en}-${item.q.en}`;
                const open = openFaq === key;
                return (
                  <div key={key} className="ss-faq-item">
                    <button type="button" onClick={() => setOpenFaq(open ? null : key)}>
                      {t(item.q.fr, item.q.en, en)}
                      <IconChevron dir={open ? "down" : "right"} size={16} />
                    </button>
                    {open ? <p>{t(item.a.fr, item.a.en, en)}</p> : null}
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
