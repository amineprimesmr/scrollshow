"use client";

import { BrandMark } from "@/components/BrandMark";
import { GOOGLE_FONTS_HREF } from "@/lib/recipe";
import { t } from "@/lib/i18n";
import { isPaidPlan } from "@/lib/plans";
import { platformById, platformName } from "@/lib/platforms";
import { navActive, PAGE_TITLES, STUDIO_NAV } from "@/lib/studio-nav";
import { sound } from "@/lib/sound";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { AddChannelModal } from "./AddChannelModal";
import { CreatePostModal } from "./CreatePostModal";
import { IconLock, IconLogout, IconPlus, NavIcon } from "./icons";
import { StudioProvider, useStudio } from "./StudioContext";
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
      <span>{t("Essai gratuit · 7 jours restants", "Free trial · 7 days left", english)}</span>
      <Link href="/app/billing" className="ss-trial__btn">
        {t("Upgrade", "Upgrade", english)}
      </Link>
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
          <Link href="/app/billing" onClick={() => setOpen(false)}>
            {t("Facturation", "Billing", english)}
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
  const { english, channels, activeChannel, setActiveChannel, setAddOpen, setPostOpen, setEditing } = useStudio();
  const item = PAGE_TITLES.find((entry) => navActive(pathname, entry.href));
  const title = item ? (english ? item.en : item.fr) : "ScrollShow";
  const onCalendar = pathname === "/app" || pathname === "/app/calendar";
  const onMcp = pathname.startsWith("/app/mcp");
  const hideHeader = onMcp || pathname.startsWith("/app/home");

  const mainNav = STUDIO_NAV.filter((e) => e.section === "main");
  const bottomNav = STUDIO_NAV.filter((e) => e.section === "bottom");

  return (
    <div className={`ss-studio ss-fastlane${onCalendar ? " is-calendar" : ""}`}>
      <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      <aside className="ss-sidebar">
        <div className="ss-sidebar__head">
          <Link href="/app/home" className="ss-sidebar__brand">
            <BrandMark size={28} className="ss-sidebar__logo" />
            <span>ScrollShow</span>
          </Link>
        </div>
        <nav className="ss-sidebar__nav">
          {mainNav.map((entry) => (
            <NavLink key={entry.href} entry={entry} pathname={pathname} english={english} />
          ))}
        </nav>
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
          <button className="ss-btn-ghost ss-btn-wide" type="button" onClick={() => setAddOpen(true)}>
            {t("Connecter un compte", "Connect an account", english)}
          </button>
          <button className={`ss-channel ${activeChannel === "all" ? "is-active" : ""}`} onClick={() => setActiveChannel("all")}>
            <BrandMark size={28} alt="" />
            <span>
              <b>{t("Tous les comptes", "All channels", english)}</b>
            </span>
          </button>
          {channels.map((channel) => (
            <button
              key={channel.id}
              className={`ss-channel ${activeChannel === channel.id ? "is-active" : ""}`}
              onClick={() => setActiveChannel(channel.id)}
            >
              <img src={channel.avatar || platformById(channel.platform)?.logo || "/logo.png"} alt="" />
              <span>
                <b>{channel.name}</b>
                <span>
                  {platformName(channel.platform)} · @{channel.handle}
                </span>
              </span>
            </button>
          ))}
        </aside>
      ) : null}

      <section className="ss-main">
        <TrialBanner />
        {!hideHeader ? (
          <header className="ss-top">
            <h1>{title}</h1>
          </header>
        ) : null}
        <Suspense fallback={null}>
          <StudioFlash />
        </Suspense>
        <div className="ss-main__body ss-page-enter" key={pathname}>
          {children}
        </div>
      </section>
      <AddChannelModal />
      <CreatePostModal />
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
