"use client";

import { BrandMark } from "@/components/BrandMark";
import { prefersEnglish, t } from "@/lib/i18n";
import { platformById, platformName } from "@/lib/platforms";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { AddChannelModal } from "./AddChannelModal";
import { CreatePostModal } from "./CreatePostModal";
import {
  IconCalendar,
  IconCard,
  IconChart,
  IconLogout,
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
  { href: "/app/media", fr: "Médias", en: "Media", icon: <IconMedia /> },
  { href: "/app/analytics", fr: "Stats", en: "Analytics", icon: <IconChart /> },
  { href: "/app/integrations", fr: "Connexions", en: "Connect", icon: <IconPlug /> },
  { href: "/app/billing", fr: "Facturation", en: "Billing", icon: <IconCard /> },
  { href: "/app/settings", fr: "Réglages", en: "Settings", icon: <IconSettings /> },
];

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, channels, activeChannel, setActiveChannel, setAddOpen, setPostOpen, setEditing } = useStudio();
  const [english, setEnglish] = useState(false);
  const item = NAV.find((entry) => (entry.href === "/app" ? pathname === "/app" : pathname.startsWith(entry.href)));
  const title = item ? (english ? item.en : item.fr) : t("Calendrier", "Calendar", english);
  const live = channels.filter((channel) => channel.connected);

  useEffect(() => {
    setEnglish(prefersEnglish());
  }, []);

  return (
    <div className="ss-studio">
      <nav className="ss-rail">
        <Link href="/" className="ss-rail__brand" aria-label="ScrollShow">
          <BrandMark size={36} className="ss-rail__logo" />
        </Link>
        {NAV.map((entry) => {
          const active = entry.href === "/app" ? pathname === "/app" : pathname.startsWith(entry.href);
          return (
            <Link key={entry.href} href={entry.href} className={active ? "is-active" : ""}>
              {entry.icon}
              <span>{english ? entry.en : entry.fr}</span>
            </Link>
          );
        })}
      </nav>

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

      <section className="ss-main">
        <header className="ss-top">
          <h1>{title}</h1>
          <div className="ss-top__tools">
            <span className="ss-lang">{english ? "EN" : "FR"}</span>
            <span className="ss-user">{user?.name || "…"}</span>
            <button
              className="ss-btn-ghost ss-btn-icon"
              type="button"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                router.push("/");
              }}
            >
              <IconLogout size={16} />
              {t("Déconnexion", "Log out", english)}
            </button>
          </div>
        </header>
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
