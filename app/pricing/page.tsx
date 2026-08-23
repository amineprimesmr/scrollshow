import { BrandMark } from "@/components/BrandMark";
import Link from "next/link";

export default function PricingPage() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
        <BrandMark size={28} />
        ScrollShow
      </Link>
      <h1 className="serif mt-8 text-5xl">Tarifs</h1>
      <p className="mt-4 max-w-xl text-[var(--muted)]">
        Commence gratuitement. Passe Pro quand ta bibliothèque dépasse 10 comptes.
      </p>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="card p-8">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Free</p>
          <p className="serif mt-3 text-4xl">0 €</p>
          <ul className="mt-6 space-y-2 text-[var(--muted)]">
            <li>10 comptes</li>
            <li>Découvertes illimitées</li>
            <li>Notes et verdicts</li>
          </ul>
          <Link href="/signup" className="btn btn-ghost mt-8">
            Créer un compte
          </Link>
        </div>
        <div className="card p-8">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--gold)]">Pro</p>
          <p className="serif mt-3 text-4xl">29 € / mois</p>
          <ul className="mt-6 space-y-2 text-[var(--muted)]">
            <li>Comptes illimités</li>
            <li>Export de bibliothèque</li>
            <li>Priorité produit</li>
          </ul>
          <Link href="/signup" className="btn btn-gold mt-8">
            Démarrer Pro plus tard
          </Link>
        </div>
      </div>
    </main>
  );
}
