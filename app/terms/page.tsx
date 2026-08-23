import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <Link href="/" className="text-sm text-[var(--muted)]">
        ← ScrollShow
      </Link>
      <h1 className="serif mt-8 text-4xl">Conditions d’utilisation</h1>
      <div className="mt-6 space-y-4 text-[var(--muted)]">
        <p>ScrollShow est un espace de recherche pour les comptes TikTok photo-slideshow.</p>
        <p>
          Tu restes responsable des contenus que tu ajoutes, des comptes que tu observes, et de
          l’usage que tu fais des formats identifiés. ScrollShow ne publie rien à ta place et ne
          scrape pas TikTok depuis le web.
        </p>
        <p>Le plan Free est limité à 10 comptes. Le plan Pro lève cette limite.</p>
        <p>Contact : hello@scrollshow.io</p>
      </div>
    </main>
  );
}
