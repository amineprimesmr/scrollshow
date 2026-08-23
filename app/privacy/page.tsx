import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <Link href="/" className="text-sm text-[var(--muted)]">
        ← ScrollShow
      </Link>
      <h1 className="serif mt-8 text-4xl">Confidentialité</h1>
      <div className="mt-6 space-y-4 text-[var(--muted)]">
        <p>Nous stockons ton email, ton prénom, et la bibliothèque de comptes que tu enregistres.</p>
        <p>Le mot de passe est hashé. La session est un cookie HTTP-only.</p>
        <p>Pas de revente de données. Pas de tracking publicitaire tiers.</p>
        <p>Pour une suppression de compte : hello@scrollshow.io</p>
      </div>
    </main>
  );
}
