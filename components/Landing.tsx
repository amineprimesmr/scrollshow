"use client";

import { LandingTestimonials, LandingFAQ, LandingFooter } from "@/components/LandingBottom";
import { PricingCards } from "@/components/PricingCards";
import { HeroSkill } from "@/components/HeroSkill";
import { LandingDemo } from "@/components/LandingDemo";
import { LandingConnections } from "@/components/LandingConnections";
import { LandingSpotlight } from "@/components/LandingSpotlight";
import { LandingNavigation } from "@/components/LandingNavigation";
import { LiquidGlassDefs } from "@/components/LiquidGlassDefs";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Beam } from "@/components/fx/Beam";
import { Metal } from "@/components/fx/Metal";

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

function ViewsHero({ english, ctaHref }: { english: boolean; ctaHref: string }) {
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
          expand = window.setTimeout(() => setPhase("expand"), 180);
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
      <div className="af-ld-atmosphere" aria-hidden="true">
        <div className="af-ld-atmosphere__light af-ld-atmosphere__light--cobalt" />
        <div className="af-ld-atmosphere__light af-ld-atmosphere__light--ice" />
        <div className="af-ld-atmosphere__wave af-ld-atmosphere__wave--near" />
        <div className="af-ld-atmosphere__wave af-ld-atmosphere__wave--far" />
        <div className="af-ld-atmosphere__shade" />
        <div className="af-ld-atmosphere__grain" />
      </div>
      <div className="af-ld-stage">
        <div className="af-ld-stage__copy">
          <h1 className="af-ld-views__title">
            <span className="af-ld-title-line">Crée et automatise tes</span>{" "}
            <span className="af-ld-title-line">slideshows avec <span className="af-ld-title-accent">ton agent</span></span>
          </h1>
          <HeroSkill english={english} />
          <div className="af-ld-hero-cta-wrap">
            <Metal preset="chromatic" strength={0.9} className="af-ld-metal-cta" normalizeHost>
              <Link href={ctaHref} className="af-ld-hero-cta">
                <span className="af-ld-hero-cta__label">{t("Automatiser mes slideshows", "Automate my slideshows", english)}</span>
                <svg className="af-ld-hero-cta__sparkle" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.1 2.4a.6.6 0 0 0-1.14 0l-1.2 3.55a3.6 3.6 0 0 1-2.25 2.25l-3.55 1.2a.6.6 0 0 0 0 1.14l3.55 1.2a3.6 3.6 0 0 1 2.25 2.25l1.2 3.55a.6.6 0 0 0 1.14 0l1.2-3.55a3.6 3.6 0 0 1 2.25-2.25l3.55-1.2a.6.6 0 0 0 0-1.14l-3.55-1.2a3.6 3.6 0 0 1-2.25-2.25l-1.2-3.55Z" /><path d="M18.6 16.1a.36.36 0 0 0-.68 0l-.5 1.46a1.9 1.9 0 0 1-1.19 1.19l-1.46.5a.36.36 0 0 0 0 .68l1.46.5a1.9 1.9 0 0 1 1.19 1.19l.5 1.46a.36.36 0 0 0 .68 0l.5-1.46a1.9 1.9 0 0 1 1.19-1.19l1.46-.5a.36.36 0 0 0 0-.68l-1.46-.5a1.9 1.9 0 0 1-1.19-1.19l-.5-1.46Z" /></svg>
              </Link>
            </Metal>
          </div>
          <LandingDemo />
        </div>
      </div>
    </section>
  );
}

export function Landing({ signedIn = false }: { signedIn?: boolean }) {
  const [english, setEnglish] = useState(false);
  const ctaHref = signedIn ? "/app" : "/signup";

  useEffect(() => {
    setEnglish(prefersEnglish());
  }, []);


  return (
    <div className="af-ld">
      <LiquidGlassDefs />
      <LandingNavigation english={english} signedIn={signedIn} />

      <main>
        <ViewsHero english={english} ctaHref={ctaHref} />

        <LandingSpotlight english={english} />

        <section id="comment" className="af-ld-steps">
          <div className="af-ld-steps__inner">
            <header className="af-ld-steps__header">
              <span className="af-ld-pill-light">{t("Méthode", "Method", english)}</span>
              <h2 className="af-ld-steps__title">
                <span>{t("Trois façons de poster,", "Three ways to post,", english)}</span>
                <span className="is-muted">{t("une seule qui tient.", "only one that holds.", english)}</span>
              </h2>
              <div className="af-ld-steps__intro">
                <p>
                  <strong>
                    {t(
                      "Tout le monde essaie les deux premières.",
                      "Everyone tries the first two.",
                      english,
                    )}
                  </strong>{" "}
                  <span>
                    {t(
                      "Elles s’arrêtent au bout de quelques jours, pour la même raison : rien ne se publie tout seul.",
                      "They stop after a few days, for the same reason: nothing publishes itself.",
                      english,
                    )}
                  </span>
                </p>
                <Link href={ctaHref} className="af-ld-dark-cta">
                  <CtaDot />
                  {t("Commencer", "Get started", english)}
                  <span aria-hidden>›</span>
                </Link>
              </div>
            </header>
            <div className="af-ld-steps__grid">
              <Beam hover size="pulse-inner" colorVariant="mono" strength={0.7} className="af-ld-step-card__beam"><article className="af-ld-step-card is-beamed is-fail">
                <div className="af-ld-step-visual">
                  <div className="af-ld-step-chips">
                    <span>Canva</span>
                    <span>{t("découper", "crop", english)}</span>
                    <span>{t("écrire", "write", english)}</span>
                    <span>{t("poster", "post", english)}</span>
                  </div>
                  <span className="af-ld-step-verdict is-ko">{t("4 h par semaine", "4 h a week", english)}</span>
                </div>
                <h3>{t("À la main", "By hand", english)}</h3>
                <p>{t("Tu montes chaque slideshow toi-même et tu postes à l’heure. Ça marche une semaine, puis tu sautes un jour, puis deux.", "You build every slideshow yourself and post on time. It works for a week, then you skip a day, then two.", english)}</p>
              </article></Beam>
              <Beam hover size="pulse-inner" colorVariant="mono" strength={0.7} className="af-ld-step-card__beam"><article className="af-ld-step-card is-beamed is-fail">
                <div className="af-ld-step-visual">
                  <div className="af-ld-step-icons">
                    <img className="af-app-icon" src="/assets/ai/claude-transparent.png" alt="Claude" width={60} height={60} />
                    <img className="af-app-icon" src="/assets/ai/codex-transparent.png" alt="Codex" width={60} height={60} />
                    <img className="af-app-icon" src="/assets/ai/cursor-transparent.png" alt="Cursor" width={60} height={60} />
                  </div>
                  <span className="af-ld-step-verdict is-ko">{t("rien n’est publié", "nothing gets published", english)}</span>
                </div>
                <h3>{t("Demander à ton agent", "Asking your agent", english)}</h3>
                <p>{t("Claude te sort des idées et du texte. Mais il n’a ni tes images, ni ton compte, ni ton calendrier : tout finit collé à la main.", "Claude gives you ideas and copy. But it has no images, no account, no calendar: you still paste everything by hand.", english)}</p>
              </article></Beam>
              <Beam hover size="pulse-inner" colorVariant="mono" strength={0.7} className="af-ld-step-card__beam"><article className="af-ld-step-card is-beamed is-win">
                <div className="af-ld-step-visual">
                  <div className="af-ld-step-earn">
                    <svg className="af-ld-step-calendar" viewBox="0 0 64 64" fill="none" aria-hidden="true"><rect x="10" y="14" width="44" height="40" rx="9" stroke="currentColor" strokeWidth="2"/><path d="M10 26h44M22 9v11M42 9v11m-19 20 6 6 13-13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span className="af-ld-step-earn__pill">{t("Prêt à publier", "Ready to publish", english)}</span>
                  </div>
                  <span className="af-ld-step-verdict is-ok">{t("3 min par semaine", "3 min a week", english)}</span>
                </div>
                <h3>{t("ScrollShow dans ton agent", "ScrollShow inside your agent", english)}</h3>
                <p>{t("Le même Claude, branché sur ton compte. Il crée les slideshows, les programme et publie — tu ne fais que valider.", "The same Claude, connected to your account. It creates the slideshows, schedules them and publishes — you only approve.", english)}</p>
              </article></Beam>
            </div>
          </div>
        </section>

        <section id="outils" className="af-ld-tools" aria-labelledby="af-ld-tools-title">
          <h2 id="af-ld-tools-title">Tout ton workflow, connecté.</h2>
          <p>De la recherche à la publication, ton agent pilote ScrollShow.</p>
          <div className="af-ld-tools__hub">ScrollShow</div>
          <LandingConnections />
        </section>

        <section id="offre" className="af-ld-pricing" aria-labelledby="af-ld-pricing-title">
          <header className="af-ld-pricing__heading">
            <p>{t("Les offres", "Plans", english)}</p>
            <h2 id="af-ld-pricing-title">{t("Un agent. Tout ton contenu.", "One agent. All your content.", english)}</h2>
            <div className="af-ld-networks af-ld-pricing__networks" aria-label={t("Plateformes", "Platforms", english)}>
              <p className="af-ld-networks__title">
                {t("Publie sur TikTok, crée avec ton assistant", "Publish on TikTok, create with your assistant", english)}
              </p>
              <ul className="af-ld-networks__row">
                {[
                  { id: "tiktok", name: "TikTok", src: "/assets/platforms/tiktok.png" },
                  { id: "claude", name: "Claude", src: "/assets/ai/claude.png" },
                  { id: "cursor", name: "Cursor", src: "/assets/ai/cursor.png" },
                  { id: "codex", name: "Codex", src: "/assets/ai/codex.png" },
                ].map((brand) => (
                  <li key={brand.id}>
                    <span className="af-ld-networks__brand">
                      <img src={brand.src} alt="" width={36} height={36} />
                      {brand.name}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </header>
          <PricingCards english={english} />
          <p className="af-ld-pricing__note">{t("L’accès à vie couvre la durée d’exploitation du service. Mêmes quotas de traitement pour toutes les offres. Abonnements aux assistants IA non inclus.", "Lifetime access covers the operating lifetime of the service. Every plan has the same processing quotas. AI assistant subscriptions are not included.", english)} <Link href="/pricing">{t("Détails des offres", "Plan details", english)}</Link></p>
        </section>

        <LandingTestimonials english={english} />
        <LandingFAQ english={english} />
      </main>

      <LandingFooter english={english} />
    </div>
  );
}
