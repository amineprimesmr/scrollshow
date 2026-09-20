import { Atmosphere } from "@/components/Atmosphere";
import { BrandMark } from "@/components/BrandMark";
import type { Metadata } from "next";
import "../liquid-glass.css";
import "./extension.css";

export const metadata: Metadata = {
  title: "Extension ScrollShow",
  description: "Cherche des carrousels directement dans ton TikTok, depuis ScrollShow.",
  robots: { index: false, follow: false },
};

const STEPS = [
  ["Télécharge l'extension", "Un fichier .zip. Décompresse-le : tu obtiens un dossier « scrollshow-extension »."],
  ["Ouvre chrome://extensions", "Colle cette adresse dans Chrome, puis active « Mode développeur » en haut à droite."],
  ["Charge le dossier", "Clique « Charger l'extension non empaquetée » et choisis le dossier décompressé."],
  ["Reste connecté à TikTok", "Connecte-toi une fois à tiktok.com dans ce même Chrome. C'est tout."],
];

export default function ExtensionPage() {
  return (
    <main className="ss-ext">
      <Atmosphere />
      <section className="ss-ext__card lg">
        <BrandMark size={34} />
        <h1>L&apos;extension ScrollShow</h1>
        <p className="ss-ext__lead">
          Tes recherches tournent dans <b>ton</b> TikTok, dans ton navigateur : les mêmes résultats que sur tiktok.com,
          selon les résultats disponibles et les limites de TikTok. Rien ne part ailleurs que sur ton compte ScrollShow.
        </p>
        <a className="ss-ext__cta lg-press" href="/scrollshow-extension.zip" download>
          Télécharger l&apos;extension
        </a>
        <ol className="ss-ext__steps">
          {STEPS.map(([title, detail], index) => (
            <li key={title}>
              <span>{index + 1}</span>
              <div>
                <b>{title}</b>
                <p>{detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="ss-ext__foot">
          Ensuite, retourne sur <a href="/app/discover">Inspiration → Recherche</a> et lance un mot-clé : une petite fenêtre
          TikTok s&apos;ouvre, défile toute seule, puis se ferme. Chrome, Edge, Brave et Arc sont compatibles.
        </p>
      </section>
    </main>
  );
}
