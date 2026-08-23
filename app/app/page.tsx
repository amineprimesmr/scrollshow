import { readSession } from "@/lib/auth";
import { readStore } from "@/lib/store";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await readSession();
  if (!user) return null;
  const data = await readStore();
  const accounts = data.accounts.filter((item) => item.userId === user.id);
  const runs = data.runs.filter((item) => item.userId === user.id);
  const keep = accounts.filter((item) => item.verdict === "keep").length;

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.18em] text-[var(--gold)]">Espace de {user.name}</p>
      <h1 className="serif mt-3 text-4xl">Vue d’ensemble</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="card p-6">
          <p className="text-sm text-[var(--muted)]">Comptes</p>
          <p className="serif mt-2 text-4xl">{accounts.length}</p>
        </div>
        <div className="card p-6">
          <p className="text-sm text-[var(--muted)]">À garder</p>
          <p className="serif mt-2 text-4xl">{keep}</p>
        </div>
        <div className="card p-6">
          <p className="text-sm text-[var(--muted)]">Découvertes</p>
          <p className="serif mt-2 text-4xl">{runs.length}</p>
        </div>
      </div>
      <div className="mt-8 flex gap-3">
        <Link href="/app/discover" className="btn btn-gold">
          Nouvelle découverte
        </Link>
        <Link href="/app/library" className="btn btn-ghost">
          Ouvrir la bibliothèque
        </Link>
      </div>
    </div>
  );
}
