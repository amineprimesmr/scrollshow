import { readSession } from "@/lib/auth";
import { hasStudioAccess } from "@/lib/plans";
import { Atmosphere } from "@/components/Atmosphere";
import { BrandMark } from "@/components/BrandMark";
import Link from "next/link";
import type { Metadata } from "next";
import "./connect.css";

export const metadata: Metadata = {
  title: "Connecte ton agent",
  description: "Autorise ton assistant à créer et publier tes carrousels depuis ScrollShow.",
};

const HOSTS = [
  { name: "Claude Code", step: "/mcp → scrollshow → Authenticate" },
  { name: "Claude app ou web", step: "Réglages → Connecteurs → Se connecter" },
  { name: "Cursor · Codex", step: "Rouvre la conversation" },
];

/**
 * Page d'atterrissage quand l'agent ne peut pas ouvrir le navigateur lui-meme.
 * Elle repond a une seule question : qu'est-ce que je fais maintenant.
 */
export default async function ConnectPage() {
  const user = await readSession();
  const ready = Boolean(user && hasStudioAccess(user.plan));

  return (
    <main className="ss-connect">
      <Atmosphere />

      <section className="ss-connect__inner">
        <Link href="/" className="ss-connect__brand" aria-label="ScrollShow, accueil">
          <BrandMark size={20} />
          ScrollShow
        </Link>

        <h1>Il te reste un clic</h1>
        <p className="ss-connect__sub">
          Autorise ton agent depuis chez lui. <strong>Aucune clé à copier.</strong>
        </p>

        <div className="ss-connect__card">
          <span className="ss-connect__edge" aria-hidden />

          <ol className="ss-connect__steps">
            <li className={user ? "is-done" : ""}>
              <span className="ss-connect__mark" aria-hidden>{user ? "✓" : "1"}</span>
              <div>
                <b>{user ? "Compte connecté" : "Connecte-toi"}</b>
                <p>{user ? user.email : "Pour savoir à quel espace rattacher ton agent."}</p>
                {user ? null : <Link className="ss-connect__cta" href="/signup?mode=signin&next=/connect">Me connecter</Link>}
              </div>
            </li>

            <li className={ready ? "is-done" : ""}>
              <span className="ss-connect__mark" aria-hidden>{ready ? "✓" : "2"}</span>
              <div>
                <b>{ready ? "Accès actif" : "Active ton accès"}</b>
                <p>{ready ? "Tes outils sont débloqués." : "29 € / mois ou 99 € à vie. Sans accès actif, les outils restent verrouillés."}</p>
                {ready ? null : <Link className="ss-connect__cta" href="/pricing">Choisir mon offre</Link>}
              </div>
            </li>

            <li>
              <span className="ss-connect__mark" aria-hidden>3</span>
              <div>
                <b>Autorise depuis ton agent</b>
                <p>Cette étape se fait chez lui, pas ici.</p>
                <ul className="ss-connect__hosts">
                  {HOSTS.map((host) => (
                    <li key={host.name}>
                      <strong>{host.name}</strong>
                      <span>{host.step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          </ol>
        </div>

        <p className="ss-connect__foot">
          Tu peux retirer un agent à tout moment dans <Link href="/app/settings">Réglages</Link>.
        </p>
      </section>
    </main>
  );
}
