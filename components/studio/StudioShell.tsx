"use client";

import { BrandMark } from "@/components/BrandMark";
import { GOOGLE_FONTS_HREF } from "@/lib/recipe";
import { t } from "@/lib/i18n";
import { isPaidPlan } from "@/lib/plans";
import { platformById, platformName } from "@/lib/platforms";
import { navActive, PAGE_TITLES, STUDIO_NAV } from "@/lib/studio-nav";
import { sound } from "@/lib/sound";
import { setStoredTheme } from "@/lib/theme";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { AddChannelModal } from "./AddChannelModal";
import { CreatePostModal } from "./CreatePostModal";
import { IconLock, IconLogout, IconMenu, IconPlus, IconX, NavIcon } from "./icons";
import { StudioProvider, useStudio } from "./StudioContext";
import ProjectSwitcher from "./ProjectSwitcher";
import { LiquidGlassDefs } from "@/components/LiquidGlassDefs";
import { NavPill } from "@/components/fx/NavPill";
import { Metal } from "@/components/fx/Metal";
import { StudioFlash } from "./StudioFlash";

function initialsOf(name?: string, email?: string) {
  const source = (name || email || "S").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function TrialBanner() {
  const { user, english } = useStudio();
  if (!user || isPaidPlan(user.plan)) return null;
  return (
    <div className="ss-trial">
      <span>{t("Choisis une offre pour accéder au studio", "Choose a plan to access the studio", english)}</span>
      <Link href="/app/settings?tab=plan" className="ss-trial__btn">
        {t("Upgrade", "Upgrade", english)}
      </Link>
    </div>
  );
}

function VerifyBanner() {
  const { user, english } = useStudio();
  const [state, setState] = useState<"idle" | "busy" | "sent" | "failed">("idle");
  if (!user || user.emailVerified) return null;
  const label = state === "busy" ? t("Envoi…", "Sending…", english)
    : state === "sent" ? t("Lien envoyé", "Link sent", english)
    : state === "failed" ? t("Réessayer", "Retry", english)
    : t("Envoyer le lien", "Send the link", english);
  return (
    <div className="ss-trial">
      <span>{t("Confirme ton adresse email pour publier et activer ton accès", "Confirm your email address to publish and activate your access", english)}</span>
      <button type="button" className="ss-trial__btn" disabled={state === "busy" || state === "sent"} onClick={async () => {
        setState("busy");
        const response = await fetch("/api/auth/verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "request" }) }).catch(() => null);
        setState(response?.ok ? "sent" : "failed");
      }}>{label}</button>
    </div>
  );
}

function SidebarProfile() {
  const { user, english } = useStudio();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const initials = initialsOf(user?.name, user?.email);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <div className={`ss-sidebar-profile${open ? " is-open" : ""}`} ref={box}>
      <button type="button" className="ss-sidebar-profile__btn" onClick={() => setOpen((v) => !v)}>
        <span className="ss-sidebar-avatar">{initials}</span>
        <span className="ss-sidebar-profile__meta">
          <strong>{user?.name || "…"}</strong>
          <em>{user?.email || ""}</em>
        </span>
      </button>
      {open ? (
        <div className="ss-sidebar-menu">
          <Link href="/app/settings" onClick={() => setOpen(false)}>
            {t("Réglages", "Settings", english)}
          </Link>
          <Link href="/app/support" onClick={() => setOpen(false)}>
            {t("Support", "Support", english)}
          </Link>
          <button type="button" onClick={() => void signOut()}>
            <IconLogout size={16} />
            {t("Déconnexion", "Log out", english)}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function NavLink({ entry, pathname, english }: { entry: (typeof STUDIO_NAV)[0]; pathname: string; english: boolean }) {
  const active = navActive(pathname, entry.href);
  const label = english ? entry.en : entry.fr;
  return (
    <Link
      href={entry.href}
      onClick={() => !active && sound.nav()}
      className={[
        "ss-sidebar-link",
        active ? "is-active" : "",
        entry.highlight ? "is-highlight" : "",
        entry.locked ? "is-locked" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <NavIcon name={entry.icon} size={18} />
      <span>{label}</span>
      {entry.badge ? <span className="ss-sidebar-dot" /> : null}
      {entry.locked ? <IconLock size={14} className="ss-sidebar-lock" /> : null}
    </Link>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, english, channels, posts, activeChannel, setActiveChannel, setAddOpen, setPostOpen, setEditing } = useStudio();
  const postCount = (id: string | "all") =>
    posts.filter((post) => post.inCalendar !== false && (id === "all" || post.channelIds.includes(id))).length;
  const item = PAGE_TITLES.find((entry) => navActive(pathname, entry.href));
  const title = item ? (english ? item.en : item.fr) : "ScrollShow";
  const onCalendar = pathname === "/app" || pathname === "/app/calendar";
  const onMcp = pathname.startsWith("/app/mcp");
  const hideHeader =
    onMcp ||
    onCalendar ||
    pathname.startsWith("/app/home") ||
    pathname.startsWith("/app/discover") ||
    pathname.startsWith("/app/unshadowban");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // The saved preference wins over whatever this browser last stored.
  useEffect(() => {
    if (user?.settings?.theme) setStoredTheme(user.settings.theme);
  }, [user?.settings?.theme]);

  const mainNav = STUDIO_NAV.filter((e) => e.section === "main");
  const bottomNav = STUDIO_NAV.filter((e) => e.section === "bottom");

  useEffect(() => setMobileNavOpen(false), [pathname]);

  return (
    <div className={`ss-studio ss-fastlane${onCalendar ? " is-calendar" : ""}`}>
      <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      <button
        type="button"
        className="ss-mobile-topbar__menu"
        aria-label={t("Ouvrir le menu", "Open menu", english)}
        onClick={() => setMobileNavOpen(true)}
      >
        <IconMenu size={20} />
      </button>
      <div className="ss-mobile-topbar__brand">
        <BrandMark size={22} />
        <span>ScrollShow</span>
      </div>
      {mobileNavOpen ? <div className="ss-mobile-backdrop" onClick={() => setMobileNavOpen(false)} /> : null}
      <aside className={`ss-sidebar${mobileNavOpen ? " is-mobile-open" : ""}`}>
        <div className="ss-sidebar__head">
          <ProjectSwitcher />
          <button
            type="button"
            className="ss-sidebar__close"
            aria-label={t("Fermer le menu", "Close menu", english)}
            onClick={() => setMobileNavOpen(false)}
          >
            <IconX size={18} />
          </button>
        </div>
        <NavPill className="ss-sidebar__nav" activeKey={pathname}>
          {mainNav.map((entry) => (
            <NavLink key={entry.href} entry={entry} pathname={pathname} english={english} />
          ))}
        </NavPill>
        <nav className="ss-sidebar__bottom">
          {bottomNav.map((entry) => (
            <NavLink key={entry.href} entry={entry} pathname={pathname} english={english} />
          ))}
        </nav>
        <SidebarProfile />
      </aside>

      {onCalendar ? (
        <aside className="ss-channels">
          <h2>{t("Comptes", "Channels", english)}</h2>
          <Metal preset="silver" strength={0.8} className="ss-btn-wide">
            <button
              className="ss-btn-purple ss-btn-wide"
              type="button"
              onClick={() => {
                setEditing(null);
                setPostOpen(true);
              }}
            >
              <IconPlus size={16} />
              {t("Nouveau post", "New post", english)}
            </button>
          </Metal>
          <button className="ss-btn-ghost ss-btn-wide" type="button" onClick={() => setAddOpen(true)}>
            {t("Connecter un compte", "Connect an account", english)}
          </button>
          <button className={`ss-channel ${activeChannel === "all" ? "is-active" : ""}`} onClick={() => setActiveChannel("all")} aria-pressed={activeChannel === "all"}>
            <BrandMark size={28} alt="" />
            <span>
              <b>{t("Tous les comptes", "All channels", english)}</b>
              <span>{postCount("all")} {postCount("all") > 1 ? t("posts", "posts", english) : "post"}</span>
            </span>
          </button>
          {channels.map((channel) => (
            <button
              key={channel.id}
              className={`ss-channel ${activeChannel === channel.id ? "is-active" : ""}`}
              onClick={() => setActiveChannel(activeChannel === channel.id ? "all" : channel.id)}
              aria-pressed={activeChannel === channel.id}
              title={activeChannel === channel.id ? t("Afficher tous les comptes", "Show all channels", english) : t("Afficher seulement ce compte", "Show only this channel", english)}
            >
              <img src={channel.avatar || platformById(channel.platform)?.logo || "/logo.png"} alt="" />
              <span>
                <b>{channel.name}</b>
                <span>
                  {platformName(channel.platform)} · @{channel.handle}
                  {channel.tracked ? ` · ${t("non connecté", "not connected", english)}` : ""}
                </span>
              </span>
              <em className="ss-channel__count">{postCount(channel.id)}</em>
            </button>
          ))}
        </aside>
      ) : null}

      <section className="ss-main">
        <VerifyBanner />
        <TrialBanner />
        <div className="ss-main__body ss-page-enter" key={pathname}>
          {!hideHeader ? (
            <header className="ss-top">
              <h1>{title}</h1>
            </header>
          ) : null}
          <Suspense fallback={null}>
            <StudioFlash />
          </Suspense>
          {children}
        </div>
      </section>
      <AddChannelModal />
      <CreatePostModal />
      <LiquidGlassDefs />
    </div>
  );
}

export function StudioShell({ children }: { children: React.ReactNode }) {
  return (
    <StudioProvider>
      <ShellInner>{children}</ShellInner>
    </StudioProvider>
  );
}
