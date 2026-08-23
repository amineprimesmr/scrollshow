import Link from "next/link";
import { readSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LogoutButton } from "./logout-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await readSession();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-6 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/app" className="flex items-center gap-3">
          <img src="/logo.svg" alt="" className="h-7 w-7" />
          <span className="text-sm font-semibold tracking-[0.16em] uppercase">ScrollShow</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-3 text-sm">
          <Link href="/app" className="text-[var(--muted)] hover:text-white">
            Vue
          </Link>
          <Link href="/app/library" className="text-[var(--muted)] hover:text-white">
            Bibliothèque
          </Link>
          <Link href="/app/discover" className="text-[var(--muted)] hover:text-white">
            Découverte
          </Link>
          <Link href="/app/settings" className="text-[var(--muted)] hover:text-white">
            Réglages
          </Link>
          <span className="rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--gold)]">
            {user.plan === "pro" ? "Pro" : "Free"}
          </span>
          <LogoutButton />
        </nav>
      </header>
      <div className="py-8">{children}</div>
    </div>
  );
}
