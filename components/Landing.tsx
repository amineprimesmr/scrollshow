"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

const REELS = [
  { src: "/assets/tiktoks/01-glowup-188k.png", slot: 1 },
  { src: "/assets/tiktoks/02-foods-107k.png", slot: 2 },
  { src: "/assets/tiktoks/03-guide-178k.png", slot: 3 },
  { src: "/assets/tiktoks/07-pov-98k.png", slot: 4 },
  { src: "/assets/tiktoks/04-marlon-65k.png", slot: 5 },
  { src: "/assets/tiktoks/08-car-16k.png", slot: 6 },
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
  return <img src="/logo.png" alt="" width={size} height={size} className="af-app-icon" />;
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
              "Connecte TikTok, prévisualise tes carrousels, choisis la privacy, publie.",
              "Connect TikTok, preview carousels, set privacy, publish.",
              english,
            )}
          </p>
          <div className="af-ld-hero-cta-wrap">
            <Link href="/pricing" className="af-ld-hero-cta">
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
  const navRef = useRef<HTMLElement | null>(null);
  const baseId = useId();

  useEffect(() => {
    setEnglish(prefersEnglish());
  }, []);

  useEffect(() => {
    const nav = navRef.current;
    const inner = nav?.querySelector<HTMLElement>(".af-ld-topnav__inner");
    if (!nav || !inner) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const onScroll = () => {
      const p = reduce ? 0 : Math.min(1, Math.max(0, window.scrollY / 180));
      nav.style.setProperty("--nav-p", p.toFixed(3));
      const frost = `blur(${(p * 14).toFixed(1)}px) saturate(${(1 + p * 0.2).toFixed(2)})`;
      inner.style.backdropFilter = frost;
      inner.style.setProperty("-webkit-backdrop-filter", frost);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const faq = [
    {
      id: "what",
      q: t("C’est quoi ScrollShow ?", "What is ScrollShow?", english),
      a: t(
        "Un outil web pour connecter ton TikTok (Login Kit), voir tes stats et tes posts, puis publier un carrousel photo (Content Posting API).",
        "A web tool to connect your TikTok (Login Kit), view stats and posts, then publish a photo carousel (Content Posting API).",
        english,
      ),
    },
    {
      id: "how",
      q: t("Comment je publie sur TikTok ?", "How do I post to TikTok?", english),
      a: t(
        "Tu crées un espace, tu cliques Continuer avec TikTok, tu choisis tes slides et la privacy, puis Publier maintenant.",
        "Create a workspace, click Continue with TikTok, pick slides and privacy, then Publish now.",
        english,
      ),
    },
    {
      id: "free",
      q: t("Je dois payer ?", "Do I have to pay?", english),
      a: t(
        "3 jours d’essai offerts sur Starter, Creator et Pro. Ensuite un abonnement est obligatoire pour ouvrir le studio.",
        "3-day trial on Starter, Creator, and Pro. After that a subscription is required to open the studio.",
        english,
      ),
    },
  ];

  return (
    <div className="af-ld">
      <header ref={navRef} className="af-ld-topnav">
        <div className="af-ld-topnav__inner">
          <Link className="af-ld-brand" href="/">
            <Logo />
            <span>ScrollShow</span>
          </Link>
          <Link className="af-ld-topnav__cta" href="/signup?mode=signin">
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
                <Link href="/pricing" className="af-ld-dark-cta">
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
                <p>{t("Choisis un plan, 3 jours d’essai, puis tu ouvres le studio.", "Pick a plan, 3-day trial, then you open the studio.", english)}</p>
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
                <h3>2 - {t("Connecte TikTok", "Connect TikTok", english)}</h3>
                <p>{t("Login Kit officiel. Profil, stats, liste de posts — les 6 scopes.", "Official Login Kit. Profile, stats, post list — all 6 scopes.", english)}</p>
              </article>
              <article className="af-ld-step-card">
                <div className="af-ld-step-visual">
                  <div className="af-ld-step-earn">
                    <span className="af-ld-step-earn__amount">Keep</span>
                    <span className="af-ld-step-earn__pill">Watch · Skip</span>
                  </div>
                </div>
                <h3>3 - {t("Publie le carrousel", "Publish the carousel", english)}</h3>
                <p>{t("Privacy, disclosure, Direct Post. Tes stats reviennent dans Analytics.", "Privacy, disclosure, Direct Post. Stats land back in Analytics.", english)}</p>
              </article>
            </div>
          </div>
        </section>

        <section id="reseaux" className="af-ld-networks" aria-label={t("Plateformes", "Platforms", english)}>
          <p className="af-ld-networks__title">
            {t("Les automatisations fonctionnent avec", "Automations work with", english)}
          </p>
          <ul className="af-ld-networks__row">
            {[
              { id: "tiktok", name: "TikTok", src: "/assets/platforms/tiktok.png" },
              { id: "instagram", name: "Instagram", src: "/assets/platforms/instagram.png" },
              { id: "facebook", name: "Facebook", src: "/assets/platforms/facebook.png" },
              { id: "x", name: "X", src: "/assets/platforms/x.png" },
            ].map((brand) => (
              <li key={brand.id}>
                <span className={`af-ld-networks__brand${brand.id === "x" ? " is-x" : ""}${brand.id === "facebook" ? " is-facebook" : ""}`}>
                  <img src={brand.src} alt="" width={36} height={36} />
                  {brand.name}
                </span>
              </li>
            ))}
          </ul>
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
              <p className="af-ld-offer__kicker">{t("Essai 3 jours — puis un abonnement", "3-day trial — then a subscription", english)}</p>
              <p className="af-ld-offer__price-row">
                <span className="af-ld-offer__price">0 €</span>
                <span>{t("pendant 3 jours, ensuite à partir de 29,99 € / mois", "for 3 days, then from €29.99 / month", english)}</span>
              </p>
              <ul>
                {[
                  t("Bibliothèque Keep / Watch / Skip", "Keep / Watch / Skip library", english),
                  t("Découvertes par mots-clés", "Keyword discoveries", english),
                  t("Starter, Creator ou Pro — tu choisis avant d’entrer", "Starter, Creator, or Pro — you choose before you enter", english),
                  t("FR + EN", "FR + EN", english),
                ].map((item) => (
                  <li key={item}>
                    <span>✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/pricing" className="af-ld-offer__cta">
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
              <Link href="/pricing" className="af-ld-closing__cta">
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
                  <a href="#reseaux">{t("Plateformes", "Platforms", english)}</a>
                </li>
                <li>
                  <Link href="/pricing">{t("Tarifs", "Pricing", english)}</Link>
                </li>
                <li>
                  <Link href="/signup?mode=signin">{t("Connexion", "Log in", english)}</Link>
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
                <li>
                  <Link href="/support">Support</Link>
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
