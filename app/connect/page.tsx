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
  { name: "Claude Code", step: "Tape /mcp, choisis scrollshow, puis Authenticate.", hint: "Un onglet s’ouvre, tu valides, c’est fini." },
  { name: "Claude (app ou web)", step: "Réglages → Connecteurs → scrollshow → Se connecter.", hint: "Le bouton lance la même autorisation." },
  { name: "Cursor · Codex", step: "Rouvre la conversation après avoir ajouté le serveur.", hint: "L’autorisation se déclenche au premier appel d’outil." },
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
          Ton agent a installé ScrollShow. Il attend juste que tu autorises l’accès à ton espace —
          <strong> aucune clé à copier</strong>, tout se passe dans ton navigateur.
        </p>

        <div className="ss-connect__card">
          <span className="ss-connect__edge" aria-hidden />

          <ol className="ss-connect__steps">
            <li className={user ? "is-done" : ""}>
              <span className="ss-connect__mark" aria-hidden>{user ? "✓" : "1"}</span>
              <div>
                <b>{user ? "Compte connecté" : "Connecte-toi à ScrollShow"}</b>
                <p>{user ? user.email : "L’autorisation a besoin de savoir à quel espace rattacher ton agent."}</p>
                {user ? null : <Link className="ss-connect__cta" href="/signup?mode=signin&next=/connect">Me connecter</Link>}
              </div>
            </li>

            <li className={ready ? "is-done" : ""}>
              <span className="ss-connect__mark" aria-hidden>{ready ? "✓" : "2"}</span>
              <div>
                <b>{ready ? "Accès actif" : "Active ton accès"}</b>
                <p>
                  {ready
                    ? "Tes outils sont débloqués."
                    : "Tu peux autoriser ton agent dès maintenant : les outils se débloqueront tout seuls à l’activation."}
                </p>
                {ready ? null : <Link className="ss-connect__cta" href="/pricing">Voir les offres</Link>}
              </div>
            </li>

            <li>
              <span className="ss-connect__mark" aria-hidden>3</span>
              <div>
                <b>Autorise depuis ton agent</b>
                <p>Cette dernière étape se fait chez lui, pas ici. Selon celui que tu utilises :</p>
                <ul className="ss-connect__hosts">
                  {HOSTS.map((host) => (
                    <li key={host.name}>
                      <strong>{host.name}</strong>
                      <span>{host.step}</span>
                      <em>{host.hint}</em>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          </ol>
        </div>

        <div className="ss-connect__after">
          <h2>Ce qu’il pourra faire juste après</h2>
          <ul>
            <li>Lire ton business et te proposer des accroches écrites pour ton audience</li>
            <li>Créer un carrousel de cinq slides, modifiable, sans quitter la conversation</li>
            <li>Le planifier dans ton calendrier — et ne publier que si tu le demandes</li>
          </ul>
        </div>

        <p className="ss-connect__foot">
          Déjà autorisé ? Retrouve et retire tes agents dans <Link href="/app/settings">Réglages → Compte</Link>.
        </p>
      </section>
    </main>
  );
}
