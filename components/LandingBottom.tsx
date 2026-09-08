"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { t } from "@/lib/i18n";
import "./landing-bottom.css";

function useSectionMotion() {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
      if (entry.isIntersecting) setSeen(true);
    }, { threshold: 0.05 });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, visible, seen };
}

// Explicitly fictional copy for the approved local design mockup.
// Replace these examples with permissioned customer quotes before publishing.
const examples = [
  { name: "Alex", role: ["Fondateur SaaS", "SaaS founder"], color: "#e2e9fb", text: ["Mon produit est prêt. Maintenant, je peux donner autant d’attention à sa distribution qu’à son développement.", "My product is ready. Now I can give its distribution the same attention as its development."] },
  { name: "Sarah", role: ["Créatrice de contenu", "Content creator"], color: "#f2dfd5", text: ["Une idée, un brief à mon agent, et mes slideshows prennent forme. Je garde la main sur le résultat.", "An idea, a brief for my agent, and my slideshows take shape. I stay in control of the result."] },
  { name: "Hugo", role: ["Développeur indépendant", "Indie developer"], color: "#dce8df", text: ["La recherche de formats et la création au même endroit. C’est le workflow que je voulais pour mon app.", "Format research and creation in one place. This is the workflow I wanted for my app."] },
  { name: "Emma", role: ["Fondatrice d’app", "App founder"], color: "#e7dff3", text: ["Je repère un format dans ma niche, je l’adapte à mon produit et je prépare la suite dans le calendrier.", "I find a format in my niche, adapt it to my product, and prepare the next steps in the calendar."] },
  { name: "Thomas", role: ["Créateur de produits", "Product builder"], color: "#f4e8cf", text: ["J’aime pouvoir travailler avec l’agent que j’utilise déjà. Pas besoin de repartir de zéro.", "I like working with the agent I already use. No need to start from scratch."] },
  { name: "Léa", role: ["Indie maker", "Indie maker"], color: "#dcebf1", text: ["Mes idées ne restent plus dans un document. Je peux les transformer en contenu, les organiser et préparer leur publication.", "My ideas no longer stay in a document. I can turn them into content, organize them, and prepare their publication."] },
  { name: "Nicolas", role: ["Fondateur SaaS", "SaaS founder"], color: "#e4e1dc", text: ["Enfin un espace pensé pour les slideshows. Le format, les slides, le compte TikTok : tout se suit.", "Finally, a workspace designed for slideshows. The format, the slides, the TikTok account: everything connects."] },
  { name: "Camille", role: ["Créatrice indépendante", "Independent creator"], color: "#f1dfe4", text: ["Je peux ajuster les textes et le ton avant de publier. L’automatisation avec mon style, c’est ce qui compte.", "I can adjust the copy and tone before publishing. Automation with my own style is what matters."] },
  { name: "Max", role: ["Développeur d’apps", "App developer"], color: "#dde4f5", text: ["Je préfère passer mon temps sur mon produit. Un workflow clair pour le contenu, ça change mon organisation.", "I prefer spending my time on my product. A clear content workflow changes how I organize my work."] },
];

export function LandingTestimonials({ english }: { english: boolean }) {
  const { ref, visible, seen } = useSectionMotion();
  const [paused, setPaused] = useState(false);
  return <section ref={ref} id="temoignages" className="sl-reviews" aria-labelledby="sl-reviews-title" data-seen={seen} data-running={visible && !paused}>
    <header className="sl-reviews__head">
      <span className="sl-reviews__badge"><i aria-hidden="true" />{t("Témoignages · Maquette", "Testimonials · Mockup", english)}</span>
      <h2 id="sl-reviews-title">{t("La parole aux créateurs.", "From the people who build.", english)}</h2>
      <p>{t("Exemples fictifs pour la maquette — les vrais retours arrivent ici.", "Fictional mockup examples — real feedback will appear here.", english)}</p>
    </header>
    <div className="sl-reviews__controls"><button type="button" className="sl-reviews__pause" aria-pressed={paused} onClick={() => setPaused(p => !p)}>
      <svg viewBox="0 0 20 20" aria-hidden="true">{paused ? <path d="m7 4 9 6-9 6Z" fill="currentColor" /> : <path d="M7 4v12M13 4v12" stroke="currentColor" strokeWidth="2" />}</svg>
      {t(paused ? "Reprendre" : "Mettre en pause", paused ? "Resume" : "Pause", english)}
    </button></div>
    <div className="sl-reviews__wall">
      {[0, 1, 2].map(column => <div className="sl-reviews__column" key={column}>
        <div className="sl-reviews__track" style={{ "--review-duration": `${46 + column * 8}s` } as CSSProperties}>
          {[0, 1].map(copy => <div className="sl-reviews__group" key={copy} aria-hidden={copy === 1 ? true : undefined}>
            {examples.slice(column * 3, column * 3 + 3).map(example => <article className="sl-review" key={example.name}>
              <p className="sl-review__quote">{example.text[english ? 1 : 0]}</p>
              <div className="sl-review__author">
                <span className="sl-review__avatar" style={{ background: example.color }} aria-hidden="true">{example.name.slice(0, 1)}</span>
                <div><strong>{example.name}<span> · {t("exemple", "example", english)}</span></strong><p>{example.role[english ? 1 : 0]}</p></div>
                <svg className="sl-review__quote-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h7v7l-4 7H3l4-7H4V5Zm10 0h7v7l-4 7h-4l4-7h-3V5Z" fill="currentColor" /></svg>
              </div>
            </article>)}
          </div>)}
        </div>
      </div>)}
    </div>
    <GlowTransition />
  </section>;
}

function GlowTransition() {
  const id = useId().replace(/:/g, "");
  const curve = "M-60 195 C240 195 295 75 720 75 C1145 75 1200 195 1500 195 L1500 245 L-60 245Z";
  return <div className="sl-horizon" aria-hidden="true"><svg viewBox="0 0 1440 220" preserveAspectRatio="none">
    <defs>
      <filter id={`${id}-soft`} x="-20%" y="-100%" width="140%" height="300%"><feGaussianBlur stdDeviation="13" /></filter>
      <filter id={`${id}-rim`} x="-20%" y="-100%" width="140%" height="300%"><feGaussianBlur stdDeviation="4" /></filter>
      <linearGradient id={`${id}-color`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ff6a19" /><stop offset=".35" stopColor="#ff330a" /><stop offset=".8" stopColor="#b5004f" /><stop offset="1" stopColor="#450043" /></linearGradient>
    </defs>
    <path className="sl-horizon__bloom" d={curve} fill="#ff400b" stroke="#ff5c14" strokeWidth="36" filter={`url(#${id}-soft)`} />
    <path d={curve} fill={`url(#${id}-color)`} stroke="#ef2440" strokeWidth="14" filter={`url(#${id}-rim)`} />
    <path d={curve} fill="#090909" transform="translate(0 12)" />
  </svg></div>;
}

export function LandingFAQ({ english }: { english: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const baseId = useId();
  const { ref, seen } = useSectionMotion();
  const questions = [
    [t("C’est quoi ScrollShow ?", "What is ScrollShow?", english), t("ScrollShow réunit la recherche de formats TikTok, la création de slideshows et leur publication. Connecte ton agent à ton espace pour préparer ton contenu à partir de ta niche et de ton produit.", "ScrollShow brings TikTok format research, slideshow creation and publishing into one workspace. Connect your agent to prepare content based on your niche and product.", english)],
    [t("Quel type de contenu puis-je créer ?", "What kind of content can I create?", english), t("Des carrousels photo et des slideshows pour TikTok : présentations de produit, conseils, listes, tutoriels ou histoires. Tu peux partir d’un brief, adapter un format repéré ou dupliquer un carrousel de ta bibliothèque.", "Photo carousels and slideshows for TikTok: product introductions, tips, lists, tutorials or stories. Start from a brief, adapt a format you discovered or duplicate a carousel from your library.", english)],
    [t("Avec quels agents ça fonctionne ?", "Which agents does it work with?", english), t("Claude, Codex et Cursor peuvent piloter les outils ScrollShow via MCP. La recherche sur Mac utilise ton Chrome ; la publication se fait sur le compte TikTok que tu as connecté et autorisé. Ton abonnement à l’assistant IA reste séparé.", "Claude, Codex and Cursor can use ScrollShow tools through MCP. Research on Mac uses your Chrome; publishing uses the TikTok account you connected and authorized. Your AI assistant subscription is separate.", english)],
    [t("Puis-je personnaliser mes slideshows ?", "Can I customize my slideshows?", english), t("Oui. Adapte les textes, les visuels, l’ordre des slides et le ton à ton produit. Tu peux prévisualiser le carrousel avant de choisir le compte, la visibilité et le moment de publication.", "Yes. Adapt the text, visuals, slide order and tone to your product. Preview your carousel before choosing the account, visibility and publishing time.", english)],
  ];
  return <section id="faq" ref={ref} className="sl-faq" data-seen={seen} aria-labelledby="sl-faq-title">
    <div className="sl-faq__layout">
      <header className="sl-faq__aside">
        <h2 id="sl-faq-title"><span>{t("Questions", "Common", english)}</span><span>{t("fréquentes", "questions", english)}</span></h2>
        <Link href="/signup" className="sl-faq__cta">{t("Commencer", "Get started", english)}<span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m7 17 10-10M7 7h10v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span></Link>
      </header>
      <div className="sl-faq__list">
        {questions.map(([question, answer], index) => <article className="sl-faq__item" key={question} data-open={open === index} style={{ "--faq-delay": `${index * 55}ms` } as CSSProperties}>
          <h3><button type="button" id={`${baseId}-q-${index}`} aria-controls={`${baseId}-a-${index}`} aria-expanded={open === index} onClick={() => setOpen(open === index ? null : index)}><span>{question}</span><i aria-hidden="true" /></button></h3>
          <div id={`${baseId}-a-${index}`} className="sl-faq__answer" role="region" aria-labelledby={`${baseId}-q-${index}`} aria-hidden={open !== index} inert={open !== index}><div><p>{answer}</p></div></div>
        </article>)}
      </div>
    </div>
  </section>;
}

export function LandingFooter({ english }: { english: boolean }) {
  return <footer className="sl-footer">
    <div className="sl-footer__main">
      <div className="sl-footer__brand"><Link href="/" aria-label="ScrollShow"><img src="/logo.png" width="36" height="36" alt="" /><strong>ScrollShow</strong></Link><p>{t("Crée. Automatise. Publie.", "Create. Automate. Publish.", english)}</p><a className="sl-footer__contact" href="mailto:aminennasri@outlook.com">aminennasri@outlook.com</a></div>
      <nav aria-label={t("Navigation de pied de page", "Footer navigation", english)}><h2>{t("Le produit", "Product", english)}</h2><Link href="/#comment">{t("Comment ça marche", "How it works", english)}</Link><Link href="/#outils">{t("Les outils", "Tools", english)}</Link><Link href="/#offre">{t("Tarifs", "Pricing", english)}</Link><Link href="/signup?mode=signin">{t("Connexion", "Log in", english)}</Link></nav>
      <nav aria-label={t("Informations légales et aide", "Legal and help", english)}><h2>{t("Informations", "Information", english)}</h2><Link href="/support">Support</Link><Link href="/terms">{t("Conditions générales", "Terms of service", english)}</Link><Link href="/privacy">{t("Confidentialité", "Privacy", english)}</Link></nav>
    </div>
    <div className="sl-footer__bottom"><p>© {new Date().getFullYear()} ScrollShow</p><a href="#vues">{t("Retour en haut", "Back to top", english)} <span aria-hidden="true">↑</span></a></div>
  </footer>;
}
