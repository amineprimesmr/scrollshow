"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { StudioProvider, useStudio } from "./StudioContext";
import { AddChannelModal } from "./AddChannelModal";
import { CreatePostModal } from "./CreatePostModal";
import { StudioFlash } from "./StudioFlash";

const NAV = [
  { href: "/app", label: "Calendar", icon: "▦" },
  { href: "/app/agent", label: "Agent", icon: "⌘" },
  { href: "/app/analytics", label: "Analytics", icon: "↗" },
  { href: "/app/media", label: "Media", icon: "▣" },
  { href: "/app/plugs", label: "Plugs", icon: "⏻" },
  { href: "/app/integrations", label: "Integrations", icon: "⧉" },
  { href: "/app/ugc", label: "UGC", icon: "🦞" },
  { href: "/app/affiliate", label: "Affiliate", icon: "☰" },
  { href: "/app/billing", label: "Billing", icon: "$" },
  { href: "/app/settings", label: "Settings", icon: "⚙" },
];

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, channels, activeChannel, setActiveChannel, setAddOpen, setPostOpen, setEditing } = useStudio();
  const [english, setEnglish] = useState(false);
  const title = NAV.find((item) => item.href === pathname)?.label || "Calendar";
  const live = channels.filter((item) => item.connected);

  useEffect(() => {
    setEnglish(prefersEnglish());
  }, []);

  return (
    <div className="ss-studio">
      <nav className="ss-rail">
        <Link href="/">
          <img src="/logo.svg" alt="ScrollShow" className="ss-rail__logo" />
        </Link>
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className={pathname === item.href ? "is-active" : ""}>
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <aside className="ss-channels">
        <h2>Channels</h2>
        <div className="ss-channels__actions">
          <button className="ss-btn-ghost" onClick={() => setAddOpen(true)}>
            {t("Connecter TikTok", "Connect TikTok", english)}
          </button>
          <button className="ss-btn-ghost" onClick={() => setAddOpen(true)} aria-label="Connect">
            ↗
          </button>
        </div>
        <button
          className="ss-btn-purple ss-btn-wide"
          onClick={() => {
            setEditing(null);
            setPostOpen(true);
          }}
        >
          Create Post
        </button>
        <button
          className={`ss-channel ${activeChannel === "all" ? "is-active" : ""}`}
          onClick={() => setActiveChannel("all")}
        >
          <img src="/logo.svg" alt="" />
          <span>
            <b>{t("Tous les comptes", "All channels", english)}</b>
            <span>{t(`${live.length} connecté${live.length > 1 ? "s" : ""}`, `${live.length} connected`, english)}</span>
          </span>
        </button>
        {channels.map((channel) => (
          <button
            key={channel.id}
            className={`ss-channel ${activeChannel === channel.id ? "is-active" : ""}`}
            onClick={() => setActiveChannel(channel.id)}
          >
            <img src={channel.avatar} alt="" />
            <span>
              <b>{channel.name}</b>
              <span>
                TikTok · @{channel.handle}
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
            <span>FR / EN</span>
            <span>{user?.name || "…"}</span>
            <button
              className="ss-btn-ghost"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                router.push("/");
              }}
            >
              Logout
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
