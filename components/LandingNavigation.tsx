"use client";

import Link from "next/link";
import localFont from "next/font/local";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const wordmarkFont = localFont({
  src: "../node_modules/@fontsource-variable/inter/files/inter-latin-wght-italic.woff2",
  weight: "100 900",
  style: "italic",
  display: "swap",
  variable: "--font-wordmark",
});

type Panel = "more" | "product" | "platforms" | "resources";
export function LandingNavigation({ english, signedIn = false }: { english: boolean; signedIn?: boolean }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const pathname = usePathname();

  // « Tarifs » vise la section offres de la page d'accueil : on y défile quand on
  // y est déjà, et on y revient depuis une autre page grâce à l'ancre.
  const goToPricing = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    if (pathname !== "/") return;
    const target = document.getElementById("offre");
    if (!target) return;
    event.preventDefault();
    setPanel(null);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", "/#offre");
  }, [pathname]);
  const [scrolled, setScrolled] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const lastTrigger = useRef<HTMLElement | null>(null);
  const t = (fr: string, en: string) => english ? en : fr;
  const groups = [
    { id: "product" as const, label: t("Le produit", "Product"), title: "ScrollShow", description: t("Tes idées. Tes slides. Ton audience.", "Your ideas. Your slides. Your audience."), cards: [
      { title: t("Crée tes carrousels", "Create your carousels"), description: t("Découvre comment passer de l’idée aux slides.", "Discover how to turn an idea into slides."), image: "/assets/tiktoks/03-guide-178k.png", href: "#comment" },
      { title: t("Ton espace de création", "Your creative workspace"), description: t("Prépare tes contenus et retrouve tes publications.", "Prepare your content and find your posts."), image: "/assets/tiktoks/01-glowup-188k.png", href: "/signup" },
    ]},
    { id: "platforms" as const, label: t("Plateformes", "Platforms"), title: t("Tes réseaux", "Your platforms"), description: t("Ton contenu trouve sa place.", "Find a home for your content."), cards: [
      { title: "TikTok", description: t("Connecte ton compte et publie tes carrousels.", "Connect your account and publish carousels."), image: "/assets/platforms/tiktok.png", href: "#reseaux" },
      { title: t("Explore les plateformes", "Explore the platforms"), description: t("Retrouve les réseaux présentés par ScrollShow.", "Discover the platforms featured on ScrollShow."), image: "/assets/platforms/instagram.png", href: "#reseaux" },
    ]},
    { id: "resources" as const, label: t("Ressources", "Resources"), title: t("Pour commencer", "Get started"), description: t("Tout pour faire ton premier pas.", "Everything you need for your first step."), cards: [
      { title: t("Comment ça marche", "How it works"), description: t("Du premier slide à la publication.", "From your first slide to publishing."), image: "/assets/tiktoks/02-foods-107k.png", href: "#comment" },
      { title: t("Questions fréquentes", "Frequently asked questions"), description: t("Les réponses avant de te lancer.", "Answers before you get started."), image: "/logo.png", href: "#faq" },
    ]},
  ];
  function open(next: Panel | null, origin?: HTMLElement) { if (origin) lastTrigger.current = origin; setPanel(next); }
  useEffect(() => {
    let frame = 0;
    const sync = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        // Separate thresholds prevent the compact menu flickering near the top.
        setScrolled(current => window.scrollY > (current ? 24 : 64));
        frame = 0;
      });
    };
    sync(); window.addEventListener("scroll", sync, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", sync); };
  }, []);
  useEffect(() => {
    const media = matchMedia("(max-width: 899px)");
    const previous = document.body.style.overflow;
    if (panel && media.matches) document.body.style.overflow = "hidden";
    const resize = () => setPanel(null);
    media.addEventListener("change", resize);
    const keydown = (e: KeyboardEvent) => {
      if (!panel) return;
      if (e.key === "Escape") { setPanel(null); lastTrigger.current?.focus(); }
      if (e.key === "Tab" && media.matches) {
        const items = Array.from(ref.current?.querySelectorAll<HTMLElement>("a,button") ?? []).filter(el => el.getClientRects().length > 0 && !el.closest("[inert]"));
        const first = items[0], last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    const focus = (e: FocusEvent) => { if (panel && !media.matches && !ref.current?.contains(e.target as Node)) setPanel(null); };
    document.addEventListener("keydown", keydown); document.addEventListener("focusin", focus);
    return () => { document.body.style.overflow = previous; media.removeEventListener("change", resize); document.removeEventListener("keydown", keydown); document.removeEventListener("focusin", focus); };
  }, [panel]);
  return <>
    <div className={`sn-scrim lg ${panel ? "is-open" : ""}`} aria-hidden="true" onClick={() => open(null)} />
    <header ref={ref} className={`sn-header ${wordmarkFont.variable}`} data-scrolled={scrolled} data-open={!!panel} onClick={e => { if ((e.target as HTMLElement).closest("a")) open(null); }}>
      <div className="sn-rail lg">
        <div className="sn-announcement"><div><a href="#comment">{t("Tes idées deviennent des carrousels. Découvre ScrollShow.", "Turn your ideas into carousels. Discover ScrollShow.")} <span aria-hidden>›</span></a></div></div>
        <div className="sn-bar"><div className="sn-left">
          <button className="sn-toggle" aria-label={panel ? t("Fermer le menu", "Close menu") : t("Ouvrir le menu", "Open menu")} aria-expanded={!!panel} aria-controls="sn-surface" onClick={e => open(panel ? null : "more", e.currentTarget)}><svg width="32" height="32" viewBox="0 0 32 32" aria-hidden><g className="sn-line sn-line-top"><path d="M7.5 15.5h17" /></g><g className="sn-line sn-line-bottom"><path d="M7.5 15.5h17" /></g></svg></button>
          <Link className="sn-mobile-logo" href="/" aria-label="ScrollShow"><img src="/logo.png" alt="" width="32" height="32" /><span aria-hidden>SCROLLSHOW</span></Link>
          <nav className="sn-primary" aria-label={t("Navigation principale", "Main navigation")}>{groups.map(g => <button key={g.id} id={`sn-trigger-${g.id}`} className="sn-trigger" aria-controls={`sn-panel-${g.id}`} aria-expanded={panel === g.id} onClick={e => open(panel === g.id ? null : g.id, e.currentTarget)}><span>{g.label}</span></button>)}<Link className="sn-trigger" href="/#offre" onClick={goToPricing}><span>{t("Tarifs", "Pricing")}</span></Link></nav>
        </div>
        <Link className="sn-wordmark" href="/" aria-label="ScrollShow"><img src="/logo.png" alt="" width="28" height="28" /><span aria-hidden>SCROLLSHOW</span></Link>
        <div className="sn-right">{signedIn ? null : <Link className="sn-login" href="/signup?mode=signin">{t("Connexion", "Log in")}</Link>}<Link className="sn-support" href="/support" aria-label={t("Assistance", "Support")}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden><path d="M5 14v-3a7 7 0 0 1 14 0v3M5 12H3v6h4v-6H5Zm14 0h2v6h-4v-6h2Zm0 6c0 3-3 3-6 3" /></svg></Link><Link className="sn-download" href={signedIn ? "/app" : "/signup"}>{signedIn ? t("Mon espace", "My workspace") : t("Commencer", "Get started")}</Link></div></div>
      </div>
      <div className="sn-surface lg" id="sn-surface" inert={!panel}><div className="sn-clip">
        <div className="sn-more" hidden={panel !== "more"}>
          <div className="sn-more-primary">{groups.map(g => <button key={g.id} onClick={() => { open(g.id); requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(`#sn-panel-${g.id} .sn-back`)?.focus()); }}>{g.label}<span aria-hidden>›</span></button>)}<Link href="/#offre" onClick={goToPricing}>{t("Tarifs", "Pricing")}<span aria-hidden>›</span></Link></div>
          <div className="sn-more-group"><h2>{t("DÉCOUVRIR", "DISCOVER")}</h2><a href="#comment">{t("Comment ça marche", "How it works")}</a><a href="#reseaux">{t("Plateformes", "Platforms")}</a><a href="#faq">FAQ</a></div>
          <div className="sn-more-group"><h2>SCROLLSHOW</h2><Link href="/support">{t("Assistance", "Support")}</Link><Link href="/privacy">{t("Confidentialité", "Privacy")}</Link><Link href="/terms">{t("Conditions d’utilisation", "Terms of use")}</Link></div>
        </div>
        {groups.map(g => <section className="sn-panel" id={`sn-panel-${g.id}`} key={g.id} hidden={panel !== g.id} aria-labelledby={`sn-trigger-${g.id}`}><button className="sn-back" onClick={() => { open("more"); requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(".sn-more-primary button")?.focus()); }}>‹ {t("Tous les menus", "All menus")}</button><div className="sn-intro"><span>{g.title}</span><p>{g.description}</p></div>{g.cards.map(c => <article className="sn-card" key={c.title}><div className={`sn-card-art ${c.image.includes("tiktoks") ? "" : "sn-card-art-icon"}`}><img src={c.image} alt="" width="160" height="240" /></div><div className="sn-card-copy"><h2>{c.title}</h2><p>{c.description}</p><div><Link className="sn-card-cta" href={c.href}>{t("Découvrir", "Discover")}</Link><Link className="sn-card-explore" href={signedIn ? "/app" : "/signup"}>{signedIn ? t("Mon espace", "My workspace") : t("Commencer", "Get started")}</Link></div></div></article>)}</section>)}
      </div></div></header>
  </>;
}
