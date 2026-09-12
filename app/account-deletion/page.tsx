import Link from "next/link";
export const metadata = { title: "Suppression du compte · ScrollShow", robots: { index: false, follow: false } };
export default async function AccountDeletion({ searchParams }: { searchParams: Promise<{ pending?: string }> }) {
  const pending = (await searchParams).pending === "1";
  return <main style={{ maxWidth: 600, margin: "15vh auto", padding: 24 }}>
    <h1>{pending ? "Suppression du compte en cours" : "Ton compte a été supprimé"}</h1>
    <p>{pending ? "Ton accès est fermé. Nous poursuivons l’annulation des services connectés puis la suppression de tes données. Les opérations interrompues sont reprises automatiquement." : "Ton compte et les accès associés sont supprimés. Les fichiers sont retirés après le délai de sécurité des liens déjà émis."}</p>
    <p>Pour toute question, <Link href="/support">contacte le support</Link>.</p>
    <Link href="/">Revenir à l’accueil</Link>
  </main>;
}
