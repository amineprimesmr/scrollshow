"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

const REELS = [
  { src: "/assets/tiktoks/01-glowup-188k.png", slot: 1 },
  { src: "/assets/tiktoks/02-foods-107k.png", slot: 2 },
  { src: "/assets/tiktoks/03-guide-178k.png", slot: 3 },
  { src: "/assets/tiktoks/07-pov-98k.png", slot: 4 },
  { src: "/assets/tiktoks/05-beach-39k.png", slot: 5 },
  { src: "/assets/tiktoks/06-water-25k.png", slot: 6 },
  { src: "/assets/tiktoks/04-marlon-65k.png", slot: 7 },
  { src: "/assets/tiktoks/08-car-16k.png", slot: 8 },
];

const AVATARS = [
  "/assets/avatars/gars1.png",
  "/assets/avatars/leo.png",
  "/assets/avatars/estebanprime.png",
  "/assets/avatars/lucasprime.png",
  "/assets/avatars/imranprime.png",
];

function prefersEnglish() {
  if (typeof navigator === "undefined") return false;
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const raw of langs) {
    const code = String(raw || "").toLowerCase();
    if (code.startsWith("fr")) return false;
    if (code.startsWith("en")) return true;
  }
  return false;
}

function t(fr: string, en: string, english: boolean) {
  return english ? en : fr;
}

function Logo({ size = 22 }: { size?: number }) {
  return <img src="/logo.svg" alt="" width={size} height={size} style={{ borderRadius: 6 }} />;
}

function CtaDot() {
  return <span className="af-ld-cta-dot" aria-hidden />;
}

function StarRow() {
  return (
    <span className="af-ld-stars" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} viewBox="0 0 20 20">
          <path d="M10 1.5 12.4 7l5.9.5-4.5 3.8 1.4 5.7L10 14.2 4.8 16.9l1.4-5.7L1.7 7.5 7.6 7 10 1.5Z" />
        </svg>
      ))}
    </span>
  );
}

function AvatarStack() {
  return (
    <span className="af-ld-avatars" aria-hidden>
      {AVATARS.map((src) => (
        <span key={src} className="af-ld-avatar">
          <img src={src} alt="" width={36} height={36} />
        </span>
      ))}
    </span>
  );
}

function ViewsHero({ english }: { english: boolean }) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [phase, setPhase] = useState("boot");

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let intro: number | undefined;
    let expand: number | undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        if (reduce) {
          setPhase("expand");
        } else {
          intro = window.setTimeout(() => setPhase("intro"), 40);
          expand = window.setTimeout(() => setPhase("expand"), 820);
        }
        io.disconnect();
      },
      { threshold: 0.18 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (intro) window.clearTimeout(intro);
      if (expand) window.clearTimeout(expand);
    };
  }, []);

  return (
    <section ref={sectionRef} id="vues" className={`af-ld-views is-${phase}`}>
      <div className="af-ld-stage">
        <div className="af-ld-stage__cards" aria-hidden>
          {REELS.map((reel, index) => (
            <figure key={reel.src} className={`af-ld-reel af-ld-reel--${reel.slot}`} style={{ "--i": index } as React.CSSProperties}>
              <div className="af-ld-reel__frame">
                <img src={reel.src} alt="" width={364} height={476} />
              </div>
            </figure>
          ))}
        </div>
        <div className="af-ld-stage__copy">
          <p className="af-ld-hero-badge">
            <span className="af-ld-hero-badge__dot" aria-hidden />
            {t("Formats qui convertissent", "Formats that convert", english)}
          </p>
          <h1 className="af-ld-views__title">
            {t("Obtiens 1,2M vues", "Get 1.2M views", english)}
            <em>{t("par semaine", "every week", english)}</em>
          </h1>
          <p className="af-ld-hero-sub">
            {t(
              "Ces TikToks tournent déjà. Tu les copies, tu les postes, tu encaisse.",
              "These TikToks already work. Copy them, post them, get paid.",
              english,
            )}
          </p>
          <div className="af-ld-hero-cta-wrap">
            <Link href="/signup" className="af-ld-hero-cta">
              <Logo size={28} />
              <span className="af-ld-hero-cta__label">{t("Créer mon espace", "Create my workspace", english)}</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Landing() {
  const [english, setEnglish] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const baseId = useId();

  useEffect(() => {
    setEnglish(prefersEnglish());
  }, []);

  const faq = [
    {
      id: "what",
      q: t("C’est quoi ScrollShow ?", "What is ScrollShow?", english),
      a: t(
        "Un QG de recherche pour les comptes TikTok photo-slideshow. Tu trouves les formats qui cartonnent, tu les classes, tu les réutilises.",
        "A research HQ for TikTok photo-slideshow accounts. Find winning formats, file them, reuse them.",
        english,
      ),
    },
    {
      id: "how",
      q: t("Comment je trouve des comptes ?", "How do I find accounts?", english),
      a: t(
        "Tu lances une découverte par mots-clés, tu ajoutes les @ qui valent le coup, et tu notes Keep / Watch / Skip.",
        "Start a keyword discovery, add the @ handles worth studying, and mark Keep / Watch / Skip.",
        english,
      ),
    },
    {
      id: "free",
      q: t("C’est gratuit ?", "Is it free?", english),
      a: t(
        "Oui. Le plan Free donne 10 comptes. Pro à 29 €/mois enlève la limite.",
        "Yes. Free includes 10 accounts. Pro at €29/month removes the cap.",
        english,
      ),
    },
  ];

  return (
    <div className="af-ld">
      <header className="af-ld-topnav">
        <div className="af-ld-topnav__inner">
          <Link className="af-ld-brand" href="/">
            <Logo />
            <span>ScrollShow</span>
          </Link>
          <Link className="af-ld-topnav__cta" href="/signup">
            {t("Se connecter · S'inscrire", "Log in · Sign up", english)}
          </Link>
        </div>
      </header>

      <main>
        <ViewsHero english={english} />

        <section id="comment" className="af-ld-steps">
          <div className="af-ld-steps__inner">
            <header className="af-ld-steps__header">
              <span className="af-ld-pill-light">{t("Méthode", "Method", english)}</span>
              <h2 className="af-ld-steps__title">
                <span>{t("3 étapes simples", "3 simple steps", english)}</span>
                <span className="is-muted">{t("pour copier ce qui marche", "to copy what works", english)}</span>
              </h2>
              <div className="af-ld-steps__intro">
                <p>
                  <strong>
                    {t(
                      "Une méthode claire : cherche, juge, republie.",
                      "A clear method: find, judge, republish.",
                      english,
                    )}
                  </strong>{" "}
                  <span>
                    {t(
                      "Ta bibliothèque garde chaque compte. La deuxième recherche ne coûte plus une heure.",
                      "Your library keeps every account. The second search no longer costs an hour.",
                      english,
                    )}
                  </span>
                </p>
                <Link href="/signup" className="af-ld-dark-cta">
                  <CtaDot />
                  {t("Commencer", "Get started", english)}
                  <span aria-hidden>›</span>
                </Link>
              </div>
            </header>
            <div className="af-ld-steps__grid">
              <article className="af-ld-step-card">
                <div className="af-ld-step-visual">
                  <div className="af-ld-step-icons">
                    <Logo size={72} />
                    <Logo size={56} />
                    <Logo size={48} />
                  </div>
                </div>
                <h3>1 - {t("Crée ton espace", "Create your workspace", english)}</h3>
                <p>{t("Compte gratuit, 10 comptes, 3 exemples déjà classés.", "Free account, 10 slots, 3 sample accounts already filed.", english)}</p>
              </article>
              <article className="af-ld-step-card">
                <div className="af-ld-step-visual">
                  <div className="af-ld-step-chips">
                    <span>glow up</span>
                    <span>bloating</span>
                    <span>routine</span>
                    <span>TikTok</span>
                  </div>
                </div>
                <h3>2 - {t("Lance une découverte", "Start a discovery", english)}</h3>
                <p>{t("Mots-clés, pistes de comptes, notes. Tout tombe dans la bibliothèque.", "Keywords, account leads, notes. Everything lands in the library.", english)}</p>
              </article>
              <article className="af-ld-step-card">
                <div className="af-ld-step-visual">
                  <div className="af-ld-step-earn">
                    <span className="af-ld-step-earn__amount">Keep</span>
                    <span className="af-ld-step-earn__pill">Watch · Skip</span>
                  </div>
                </div>
                <h3>3 - {t("Juge et réutilise", "Judge and reuse", english)}</h3>
                <p>{t("Keep / Watch / Skip. Le format qui cartonne devient ton prochain post.", "Keep / Watch / Skip. The format that wins becomes your next post.", english)}</p>
              </article>
            </div>
          </div>
        </section>

        <section id="offre" className="af-ld-offer">
          <div className="af-ld-offer__inner">
            <h2>
              <span>
                {t("Rejoins ScrollShow", "Join ScrollShow", english)}
                <span className="af-ld-offer__mark">
                  <Logo size={22} />
                </span>
              </span>
              <span>{t("et copie les formats", "and copy the formats", english)}</span>
              <span>{t("qui cartonnent déjà", "that already win", english)}</span>
            </h2>
            <div className="af-ld-offer__proof">
              <AvatarStack />
              <span className="af-ld-offer__proof-meta">
                <StarRow />
                <span>{t("Créateurs ScrollShow", "ScrollShow creators", english)}</span>
              </span>
            </div>
            <article className="af-ld-offer__card">
              <p className="af-ld-offer__kicker">{t("Plan Free — accès immédiat", "Free plan — instant access", english)}</p>
              <p className="af-ld-offer__price-row">
                <span className="af-ld-offer__price">0 €</span>
                <span>{t("puis 29 € / mois en Pro", "then €29 / month on Pro", english)}</span>
              </p>
              <ul>
                {[
                  t("Bibliothèque Keep / Watch / Skip", "Keep / Watch / Skip library", english),
                  t("Découvertes par mots-clés", "Keyword discoveries", english),
                  t("10 comptes en Free, illimité en Pro", "10 accounts on Free, unlimited on Pro", english),
                  t("FR + EN", "FR + EN", english),
                ].map((item) => (
                  <li key={item}>
                    <span>✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="af-ld-offer__cta">
                <CtaDot />
                {t("Créer mon espace", "Create my workspace", english)}
                <span aria-hidden>›</span>
              </Link>
            </article>
          </div>
        </section>

        <section id="faq" className="af-ld-faq">
          <div className="af-ld-faq__inner">
            <header className="af-ld-faq__header">
              <div>
                <span className="af-ld-pill-light">FAQ</span>
                <h2>
                  <span>{t("Tes questions.", "Your questions.", english)}</span>
                  <span className="is-muted">{t("Nos réponses", "Our answers", english)}</span>
                </h2>
              </div>
            </header>
            <div className="af-ld-faq__list">
              {faq.map((item) => {
                const open = openId === item.id;
                return (
                  <article key={item.id} className={`af-ld-faq__item${open ? " is-open" : ""}`}>
                    <h3>
                      <button
                        type="button"
                        id={`${baseId}-${item.id}-btn`}
                        aria-expanded={open}
                        onClick={() => setOpenId(open ? null : item.id)}
                      >
                        <span>{item.q}</span>
                        <span className="af-ld-faq__icon" aria-hidden />
                      </button>
                    </h3>
                    {open ? (
                      <div role="region">
                        <p>{item.a}</p>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="af-ld-closing">
          <div className="af-ld-closing__stage">
            <article className="af-ld-closing__card">
              <h2>{t("Les formats sont déjà là. Copie-les.", "The formats are already out there. Copy them.", english)}</h2>
              <p>
                <strong>ScrollShow</strong>{" "}
                {t(
                  "range les comptes slideshow qui cartonnent — pour que tu publies avec un format déjà prouvé.",
                  "files the slideshow accounts that win — so you publish with a format already proven.",
                  english,
                )}
              </p>
              <div className="af-ld-closing__proof">
                <AvatarStack />
                <span className="af-ld-offer__proof-meta">
                  <StarRow />
                  <span>{t("Créateurs ScrollShow", "ScrollShow creators", english)}</span>
                </span>
              </div>
              <Link href="/signup" className="af-ld-closing__cta">
                <CtaDot />
                {t("Créer mon espace", "Create my workspace", english)}
                <span aria-hidden>›</span>
              </Link>
            </article>
            <div className="af-ld-closing__brand" aria-hidden>
              <Logo size={72} />
            </div>
          </div>
        </section>
      </main>

      <footer className="af-ld-footer">
        <div className="af-ld-footer__inner">
          <div className="af-ld-footer__grid">
            <div>
              <Link className="af-ld-brand" href="/">
                <Logo size={28} />
                <span>ScrollShow</span>
              </Link>
              <a className="af-ld-footer__email" href="mailto:hello@scrollshow.io">
                hello@scrollshow.io
              </a>
            </div>
            <section>
              <h2>{t("Navigation", "Navigation", english)}</h2>
              <ul>
                <li>
                  <a href="#vues">{t("Vues", "Views", english)}</a>
                </li>
                <li>
                  <a href="#comment">{t("Méthode", "Method", english)}</a>
                </li>
                <li>
                  <Link href="/pricing">{t("Tarifs", "Pricing", english)}</Link>
                </li>
                <li>
                  <Link href="/login">{t("Connexion", "Log in", english)}</Link>
                </li>
              </ul>
            </section>
            <section>
              <h2>{t("Informations", "Information", english)}</h2>
              <ul>
                <li>
                  <Link href="/terms">{t("Conditions générales", "Terms of Service", english)}</Link>
                </li>
                <li>
                  <Link href="/privacy">{t("Confidentialité", "Privacy", english)}</Link>
                </li>
              </ul>
            </section>
          </div>
          <p className="af-ld-footer__copy">© {new Date().getFullYear()} ScrollShow — All rights reserved</p>
        </div>
      </footer>
    </div>
  );
}
