"use client";

import { LandingTestimonials, LandingFAQ, LandingFooter } from "@/components/LandingBottom";
import { PricingCards } from "@/components/PricingCards";
import { HeroSkill } from "@/components/HeroSkill";
import { LandingDemo } from "@/components/LandingDemo";
import { LandingConnections } from "@/components/LandingConnections";
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
              <Link href="/signup" className="af-ld-hero-cta">
                <span className="af-ld-hero-cta__label">{t("Créer mes slideshows", "Create my slideshows", english)}</span>
              </Link>
            </Metal>
          </div>
          <LandingDemo />
        </div>
      </div>
    </section>
  );
}

export function Landing() {
  const [english, setEnglish] = useState(false);

  useEffect(() => {
    setEnglish(prefersEnglish());
  }, []);


  return (
    <div className="af-ld">
      <LiquidGlassDefs />
      <LandingNavigation english={english} />

      <main>
        <ViewsHero english={english} />

        <section id="comment" className="af-ld-steps">
          <div className="af-ld-steps__inner">
            <header className="af-ld-steps__header">
              <span className="af-ld-pill-light">{t("Méthode", "Method", english)}</span>
              <h2 className="af-ld-steps__title">
                <span>{t("De l’idée au post,", "From idea to post,", english)}</span>
                <span className="is-muted">{t("avec ton agent.", "with your agent.", english)}</span>
              </h2>
              <div className="af-ld-steps__intro">
                <p>
                  <strong>
                    {t(
                      "Connecte ton agent, trouve ton format, prépare tes slideshows.",
                      "A clear method: find, judge, republish.",
                      english,
                    )}
                  </strong>{" "}
                  <span>
                    {t(
                      "Tes recherches, ton contenu et ton calendrier restent dans le même espace.",
                      "Your research, content and calendar stay in the same workspace.",
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
              <Beam hover size="pulse-inner" colorVariant="mono" strength={0.7} className="af-ld-step-card__beam"><article className="af-ld-step-card is-beamed">
                <div className="af-ld-step-visual">
                  <div className="af-ld-step-icons">
                    <img className="af-app-icon" src="/assets/ai/claude-transparent.png" alt="Claude" width={60} height={60} />
                    <img className="af-app-icon" src="/assets/ai/codex-transparent.png" alt="Codex" width={60} height={60} />
                    <img className="af-app-icon" src="/assets/ai/cursor-transparent.png" alt="Cursor" width={60} height={60} />
                  </div>
                </div>
                <h3>1 - {t("Connecte ton agent", "Connect your agent", english)}</h3>
                <p>{t("Relie Claude, Codex ou Cursor à ton espace ScrollShow.", "Connect Claude, Codex or Cursor to your ScrollShow workspace.", english)}</p>
              </article></Beam>
              <Beam hover size="pulse-inner" colorVariant="mono" strength={0.7} className="af-ld-step-card__beam"><article className="af-ld-step-card is-beamed">
                <div className="af-ld-step-visual">
                  <div className="af-ld-step-chips">
                    <span>glow up</span>
                    <span>bloating</span>
                    <span>routine</span>
                    <span>TikTok</span>
                  </div>
                </div>
                <h3>2 - {t("Trouve ton format", "Find your format", english)}</h3>
                <p>{t("Explore ta niche et garde les formats qui correspondent à ton produit.", "Explore your niche and save formats that fit your product.", english)}</p>
              </article></Beam>
              <Beam hover size="pulse-inner" colorVariant="mono" strength={0.7} className="af-ld-step-card__beam"><article className="af-ld-step-card is-beamed">
                <div className="af-ld-step-visual">
                  <div className="af-ld-step-earn">
                    <svg className="af-ld-step-calendar" viewBox="0 0 64 64" fill="none" aria-hidden="true"><rect x="10" y="14" width="44" height="40" rx="9" stroke="currentColor" strokeWidth="2"/><path d="M10 26h44M22 9v11M42 9v11m-19 20 6 6 13-13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span className="af-ld-step-earn__pill">{t("Prêt à publier", "Ready to publish", english)}</span>
                  </div>
                </div>
                <h3>3 - {t("Crée et programme", "Create and schedule", english)}</h3>
                <p>{t("Choisis ton compte, la visibilité et le créneau. Suis ensuite le résultat de chaque publication.", "Choose your account, visibility and time. Then track each publication’s result.", english)}</p>
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

        <section id="reseaux" className="af-ld-networks" aria-label={t("Plateformes", "Platforms", english)}>
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
                <span className={`af-ld-networks__brand${brand.id === "x" ? " is-x" : ""}${brand.id === "facebook" ? " is-facebook" : ""}`}>
                  <img src={brand.src} alt="" width={36} height={36} />
                  {brand.name}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section id="offre" className="af-ld-pricing" aria-labelledby="af-ld-pricing-title">
          <header className="af-ld-pricing__heading">
            <p>{t("Les offres", "Plans", english)}</p>
            <h2 id="af-ld-pricing-title">{t("Un agent. Tout ton contenu.", "One agent. All your content.", english)}</h2>
            <span>{t("Le même studio complet. Choisis ton accès.", "The same complete studio. Choose your access.", english)}</span>
          </header>
          <PricingCards english={english} />
          <p className="af-ld-pricing__note">{t("L’accès à vie couvre la durée d’exploitation du service. Mêmes quotas de traitement pour les deux offres. Abonnements aux assistants IA non inclus.", "Lifetime access covers the operating lifetime of the service. Both plans have the same processing quotas. AI assistant subscriptions are not included.", english)} <Link href="/pricing">{t("Détails des offres", "Plan details", english)}</Link></p>
        </section>

        <LandingTestimonials english={english} />
        <LandingFAQ english={english} />
      </main>

      <LandingFooter english={english} />
    </div>
  );
}
