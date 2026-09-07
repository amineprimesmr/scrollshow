"use client";

import { t } from "@/lib/i18n";
import Link from "next/link";
import { useState } from "react";
import { IconChevron } from "../icons";
import { useStudio } from "../StudioContext";

type FaqItem = { q: { fr: string; en: string }; a: { fr: string; en: string }; href?: string };
type FaqBlock = { section: { fr: string; en: string }; items: FaqItem[] };

export const FAQ: FaqBlock[] = [
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
        href: "/app/marketplace",
      },
      {
        q: { fr: "Que faire les premières semaines ?", en: "What should I do in the first few weeks?" },
        a: {
          fr: "Connecte TikTok, planifie 3 à 5 posts par semaine, et regarde dans Overview quels hooks gagnent.",
          en: "Connect TikTok, schedule 3–5 posts per week, track what hooks win in Overview.",
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
        q: { fr: "Comment savoir si je suis shadowban ?", en: "How do I know if I'm shadowbanned?" },
        a: {
          fr: "La page Shadowban compare ta portée récente à ta moyenne et te donne un test manuel de 2 minutes avec un hashtag jetable.",
          en: "The Shadowban page compares your recent reach to your average and gives you a 2-minute manual test with a throwaway hashtag.",
        },
        href: "/app/unshadowban",
      },
      {
        q: { fr: "Comment toucher le public US depuis la France ?", en: "How do I reach the US audience from abroad?" },
        a: {
          fr: "Deux méthodes : contenu 100 % anglais publié aux heures de New York, ou un iPhone US dédié avec ton propre VPN Outline. Le guide complet est dans Poster aux US.",
          en: "Two methods: 100% English content posted on New York time, or a dedicated US iPhone with your own Outline VPN. The full guide is under Post to the US.",
        },
        href: "/app/post-us",
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
        href: "/app/marketplace",
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
      {
        q: { fr: "Comment publier depuis mon IA (Cursor, Claude Code) ?", en: "How do I publish from my AI (Cursor, Claude Code)?" },
        a: {
          fr: "Crée une clé API dans MCP, colle le message de setup dans ton IA, puis demande-lui de créer et planifier un post.",
          en: "Create an API key under MCP, paste the setup message into your AI, then ask it to create and schedule a post.",
        },
        href: "/app/mcp",
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
        href: "/app/integrations",
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
          fr: "Un compte TikTok ou Instagram US/EU chauffé sur un vrai téléphone, livré prêt à connecter à ScrollShow.",
          en: "A US/EU TikTok or Instagram account warmed on a real phone, delivered ready to connect to ScrollShow.",
        },
        href: "/app/warmed-accounts",
      },
      {
        q: { fr: "Comment supprimer mon compte ou mes données ?", en: "How do I delete my account or data?" },
        a: {
          fr: "Réglages → Danger → Supprimer le compte. Tout est effacé immédiatement : posts, médias, clés API, comptes connectés.",
          en: "Settings → Danger → Delete account. Everything is wiped immediately: posts, media, API keys, connected accounts.",
        },
        href: "/app/settings",
      },
    ],
  },
];

export function SupportView() {
  const { english: en, user } = useStudio();
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const subject = encodeURIComponent(t("Support ScrollShow", "ScrollShow support", en));
  const body = encodeURIComponent(`\n\n—\n${user?.email || ""}`);

  return (
    <div className="ss-support">
      <div className="ss-panel ss-support-contact">
        <div>
          <h2>{t("Besoin d'aide ?", "Need help?", en)}</h2>
          <p className="ss-lead">
            {t(
              "Réponse sous 24 h ouvrées. Décris ce que tu voulais faire, ce qui s'est passé, et le compte concerné.",
              "We answer within one business day. Describe what you tried, what happened, and which account.",
              en,
            )}
          </p>
        </div>
        <a className="ss-btn-purple" href={`mailto:support@scrollshow.io?subject=${subject}&body=${body}`}>
          {t("Écrire au support", "Email support", en)}
        </a>
      </div>

      <section className="ss-faq">
        <h2>{t("Questions fréquentes", "Frequently asked questions", en)}</h2>
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
                    {open ? (
                      <p>
                        {t(item.a.fr, item.a.en, en)}
                        {item.href ? (
                          <>
                            {" "}
                            <Link href={item.href}>{t("Ouvrir →", "Open →", en)}</Link>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <div className="ss-panel">
        <h2>{t("Ressources", "Resources", en)}</h2>
        <ul className="ss-feat">
          <li>
            <Link href="/app/post-us">{t("Guide : poster aux US à 100 %", "Guide: post to the US, 100%", en)}</Link>
          </li>
          <li>
            <Link href="/app/unshadowban">{t("Détecteur de shadowban", "Shadowban detector", en)}</Link>
          </li>
          <li>
            <Link href="/app/mcp">{t("Brancher ton IA (MCP)", "Connect your AI (MCP)", en)}</Link>
          </li>
          <li>
            <a href="/cgu" target="_blank" rel="noreferrer">{t("Conditions d'utilisation", "Terms of service", en)}</a> ·{" "}
            <a href="/confidentialite" target="_blank" rel="noreferrer">{t("Confidentialité", "Privacy", en)}</a>
          </li>
        </ul>
      </div>
    </div>
  );
}
