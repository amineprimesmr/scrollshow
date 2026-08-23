import Link from "next/link";

const features = [
  {
    fr: "Découverte par mots-clés",
    en: "Keyword discovery",
    text: "Lance une recherche, récupère des pistes de comptes, et range tout dans ta bibliothèque.",
  },
  {
    fr: "Jugement, pas un dump",
    en: "Judgment, not a dump",
    text: "Keep / Watch / Skip. Notes. Vues vs followers. Tu vois tout de suite ce qui vaut le reverse-engineer.",
  },
  {
    fr: "Bibliothèque qui reste",
    en: "A library that stays",
    text: "Chaque compte trouvé est classé. La deuxième question ne coûte plus une deuxième recherche.",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="ScrollShow" className="h-8 w-8" />
          <span className="text-sm font-semibold tracking-[0.18em] uppercase">ScrollShow</span>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/pricing" className="text-[var(--muted)] hover:text-white">
            Tarifs
          </Link>
          <Link href="/login" className="btn btn-ghost">
            Connexion
          </Link>
          <Link href="/signup" className="btn btn-gold">
            Créer mon espace
          </Link>
        </nav>
      </header>

      <section className="grid items-center gap-12 py-20 md:grid-cols-2">
        <div>
          <p className="mb-4 text-xs uppercase tracking-[0.22em] text-[var(--gold)]">
            SaaS indépendant · scrollshow.io
          </p>
          <h1 className="serif text-5xl leading-[1.05] md:text-6xl">
            Trouve les comptes slideshow qui cartonnent.
          </h1>
          <p className="mt-6 max-w-md text-lg text-[var(--muted)]">
            ScrollShow est le QG de recherche des carrousels TikTok. Tu cherches, tu juges, tu
            classifies — puis tu publies avec un format qui a déjà prouvé qu’il marche.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="btn btn-gold">
              Commencer gratuitement
            </Link>
            <Link href="/pricing" className="btn btn-ghost">
              Voir les tarifs
            </Link>
          </div>
        </div>
        <div className="card p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Bibliothèque</p>
          {[
            ["@glowreset.lab", "Keep", "92k vues moy."],
            ["@foods.debloat", "Keep", "61k vues moy."],
            ["@protocol.notes", "Watch", "128k vues moy."],
          ].map(([handle, verdict, stat]) => (
            <div key={handle} className="mt-4 flex items-center justify-between border-t border-[var(--line)] pt-4">
              <div>
                <p className="font-medium">{handle}</p>
                <p className="text-sm text-[var(--muted)]">{stat}</p>
              </div>
              <span className="rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--gold)]">
                {verdict}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 pb-20 md:grid-cols-3">
        {features.map((item) => (
          <div key={item.fr} className="card p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--gold)]">{item.en}</p>
            <h2 className="serif mt-3 text-2xl">{item.fr}</h2>
            <p className="mt-3 text-[var(--muted)]">{item.text}</p>
          </div>
        ))}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line)] py-8 text-sm text-[var(--muted)]">
        <p>© {new Date().getFullYear()} ScrollShow</p>
        <div className="flex gap-4">
          <Link href="/terms">CGU</Link>
          <Link href="/privacy">Confidentialité</Link>
          <a href="mailto:hello@scrollshow.io">hello@scrollshow.io</a>
        </div>
      </footer>
    </main>
  );
}
