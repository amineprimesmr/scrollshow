"use client";

import { BrandMark } from "@/components/BrandMark";
import { GOOGLE_FONTS_HREF } from "@/lib/recipe";
import { t } from "@/lib/i18n";
import { platformById, platformName } from "@/lib/platforms";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { AddChannelModal } from "./AddChannelModal";
import { CreatePostModal } from "./CreatePostModal";
import {
  IconCalendar,
  IconCard,
  IconChart,
  IconLogout,
  IconMcp,
  IconMedia,
  IconPlus,
  IconPlug,
  IconSettings,
} from "./icons";
import { StudioProvider, useStudio } from "./StudioContext";
import { StudioFlash } from "./StudioFlash";

const NAV: {
  href: string;
  fr: string;
  en: string;
  icon: ReactNode;
}[] = [
  { href: "/app", fr: "Calendrier", en: "Calendar", icon: <IconCalendar /> },
  { href: "/app/marketplace", fr: "Marketplace", en: "Marketplace", icon: <IconMedia /> },
  { href: "/app/analytics", fr: "Stats", en: "Analytics", icon: <IconChart /> },
  { href: "/app/integrations", fr: "Connexions", en: "Connect", icon: <IconPlug /> },
  { href: "/app/mcp", fr: "MCP", en: "MCP", icon: <IconMcp /> },
];

const PAGE_TITLES: { href: string; fr: string; en: string }[] = [
  ...NAV,
  { href: "/app/billing", fr: "Facturation", en: "Billing" },
  { href: "/app/settings", fr: "Réglages", en: "Settings" },
];

function initialsOf(name?: string, email?: string) {
  const source = (name || email || "S").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function RailProfile() {
  const { user, english } = useStudio();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const initials = initialsOf(user?.name, user?.email);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <div className={`ss-rail-profile${open ? " is-open" : ""}`} ref={box}>
      <button
        type="button"
        className="ss-rail-profile__btn"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={user?.name || t("Profil", "Profile", english)}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="ss-rail-avatar" aria-hidden>
          {initials || "S"}
        </span>
      </button>
      {open ? (
        <div className="ss-rail-menu" role="menu">
          <div className="ss-rail-menu__head">
            <span className="ss-rail-avatar" aria-hidden>
              {initials || "S"}
            </span>
            <span>
              <strong>{user?.name || "…"}</strong>
              <em>{user?.email || ""}</em>
            </span>
          </div>
          <Link href="/app/settings" role="menuitem" onClick={() => setOpen(false)}>
            <IconSettings size={16} />
            {t("Réglages", "Settings", english)}
          </Link>
          <Link href="/app/billing" role="menuitem" onClick={() => setOpen(false)}>
            <IconCard size={16} />
            {t("Facturation", "Billing", english)}
          </Link>
          <Link href="/app/mcp" role="menuitem" onClick={() => setOpen(false)}>
            <IconMcp size={16} />
            MCP
          </Link>
          <button type="button" role="menuitem" onClick={() => void signOut()}>
            <IconLogout size={16} />
            {t("Déconnexion", "Log out", english)}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { english, channels, activeChannel, setActiveChannel, setAddOpen, setPostOpen, setEditing } = useStudio();
  const item = PAGE_TITLES.find((entry) => (entry.href === "/app" ? pathname === "/app" : pathname.startsWith(entry.href)));
  const title = item ? (english ? item.en : item.fr) : t("Calendrier", "Calendar", english);
  const onCalendar = pathname === "/app";
  const onMcp = pathname.startsWith("/app/mcp");
  const live = channels.filter((channel) => channel.connected);

  return (
    <div className={`ss-studio${onCalendar ? " is-calendar" : ""}`}>
      <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      <nav className="ss-rail">
        <Link href="/" className="ss-rail__brand" aria-label="ScrollShow">
          <BrandMark size={36} className="ss-rail__logo" />
        </Link>
        <div className="ss-rail__nav">
          {NAV.map((entry) => {
            const active = entry.href === "/app" ? pathname === "/app" : pathname.startsWith(entry.href);
            return (
              <Link key={entry.href} href={entry.href} className={active ? "is-active" : ""}>
                {entry.icon}
                <span>{english ? entry.en : entry.fr}</span>
              </Link>
            );
          })}
        </div>
        <RailProfile />
      </nav>

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
        <button
          className={`ss-channel ${activeChannel === "all" ? "is-active" : ""}`}
          onClick={() => setActiveChannel("all")}
        >
          <BrandMark size={28} alt="" />
          <span>
            <b>{t("Tous les comptes", "All channels", english)}</b>
            <span>
              {live.length
                ? t(`${live.length} connecté${live.length > 1 ? "s" : ""}`, `${live.length} connected`, english)
                : t("Aucun connecté", "None connected", english)}
            </span>
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
                {channel.connected ? "" : ` · ${t("à connecter", "not connected", english)}`}
              </span>
            </span>
          </button>
        ))}
      </aside>
      ) : null}

      <section className="ss-main">
        {onMcp ? null : (
          <header className="ss-top">
            <h1>{title}</h1>
          </header>
        )}
        <Suspense fallback={null}>
          <StudioFlash />
        </Suspense>
        {children}
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
