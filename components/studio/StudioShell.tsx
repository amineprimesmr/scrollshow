"use client";

import { PLATFORMS } from "@/lib/platforms";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { StudioProvider, useStudio } from "./StudioContext";
import { AddChannelModal } from "./AddChannelModal";
import { CreatePostModal } from "./CreatePostModal";

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
  const title = NAV.find((item) => item.href === pathname)?.label || "Calendar";

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
            Add Channel
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
            <b>All channels</b>
            <span>{channels.length} connected</span>
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
                {PLATFORMS.find((item) => item.id === channel.platform)?.name} · @{channel.handle}
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
