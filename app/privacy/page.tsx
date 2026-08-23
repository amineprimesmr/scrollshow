import { LegalShell } from "@/components/LegalShell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How ScrollShow stores account data and TikTok OAuth tokens for Login Kit and Content Posting.",
};

export default function PrivacyPage() {
  return (
    <LegalShell titleFr="Politique de confidentialité" titleEn="Privacy Policy" childrenFr={<Fr />} childrenEn={<En />} />
  );
}

function Fr() {
  return (
    <div>
      <p>
        Cette politique décrit comment <strong>ScrollShow</strong> (
        <a href="https://scrollshow.io">https://scrollshow.io</a>) traite vos données lorsque vous utilisez le site
        et l’espace créateur.
      </p>
      <h2>1. Responsable</h2>
      <p>
        Éditeur : ScrollShow<br />
        Contact : <a href="mailto:hello@scrollshow.io">hello@scrollshow.io</a><br />
        Site : <a href="https://scrollshow.io">scrollshow.io</a>
      </p>
      <h2>2. Données collectées</h2>
      <ul>
        <li>
          <strong>Compte</strong> : e-mail, prénom, mot de passe hashé, cookie de session HTTP-only.
        </li>
        <li>
          <strong>Bibliothèque / studio</strong> : brouillons, médias que vous ajoutez, dates de planification.
        </li>
        <li>
          <strong>TikTok</strong> (uniquement si vous cliquez « Continuer avec TikTok ») : voir section 3.
        </li>
      </ul>
      <h2 id="tiktok">3. Login Kit et Content Posting</h2>
      <p>
        Lorsque vous connectez TikTok, vous autorisez ScrollShow via le Login Kit officiel. Selon les scopes
        approuvés, nous traitons :
      </p>
      <ul>
        <li>
          <strong>Identité</strong> (<code>user.info.basic</code> / <code>user.info.profile</code>) : open_id,
          avatar, nom d’affichage, username, bio, lien de profil.
        </li>
        <li>
          <strong>Statistiques</strong> (<code>user.info.stats</code>) : abonnés, abonnements, likes, nombre de
          vidéos.
        </li>
        <li>
          <strong>Liste de posts</strong> (<code>video.list</code>) : métadonnées et métriques publiques (vues,
          likes, commentaires, partages).
        </li>
        <li>
          <strong>Publication</strong> (<code>video.upload</code> / <code>video.publish</code>) : envoi d’un
          carrousel photo vers le compte connecté, uniquement après votre clic « Publier ».
        </li>
        <li>
          <strong>Jetons OAuth</strong> : access_token / refresh_token stockés côté serveur, jamais envoyés au
          navigateur. Pas de mot de passe TikTok.
        </li>
      </ul>
      <p>
        Finalités : afficher votre profil et vos stats, lister vos posts, publier à votre demande. Nous ne
        revendons pas vos données TikTok. Déconnexion / révocation depuis Réglages. Redirection :{" "}
        <code>https://scrollshow.io/tiktok/callback</code>.
      </p>
      <h2>4. Localisation</h2>
      <p>ScrollShow ne collecte pas votre position GPS.</p>
      <h2>5. Conservation et droits</h2>
      <p>
        Les données de compte sont conservées tant que le compte existe. Les jetons TikTok sont supprimés à la
        déconnexion. Pour accès, rectification ou suppression :{" "}
        <a href="mailto:hello@scrollshow.io">hello@scrollshow.io</a>.
      </p>
      <h2>6. Partage</h2>
      <p>
        Pas de revente. Hébergement Vercel. TikTok reçoit uniquement les appels API que vous déclenchez
        (connexion, lecture, publication).
      </p>
    </div>
  );
}

function En() {
  return (
    <div>
      <p>
        This policy describes how <strong>ScrollShow</strong> (
        <a href="https://scrollshow.io">https://scrollshow.io</a>) processes your data when you use the site and
        creator workspace.
      </p>
      <h2>1. Controller</h2>
      <p>
        Publisher: ScrollShow<br />
        Contact: <a href="mailto:hello@scrollshow.io">hello@scrollshow.io</a><br />
        Site: <a href="https://scrollshow.io">scrollshow.io</a>
      </p>
      <h2>2. Data we collect</h2>
      <ul>
        <li>
          <strong>Account</strong>: email, first name, hashed password, HTTP-only session cookie.
        </li>
        <li>
          <strong>Library / studio</strong>: drafts, media you add, scheduled dates.
        </li>
        <li>
          <strong>TikTok</strong> (only if you click “Continue with TikTok”): see section 3.
        </li>
      </ul>
      <h2 id="tiktok">3. Login Kit and Content Posting</h2>
      <p>
        When you connect TikTok, you authorize ScrollShow via official Login Kit. Depending on approved scopes, we
        process:
      </p>
      <ul>
        <li>
          <strong>Identity</strong> (<code>user.info.basic</code> / <code>user.info.profile</code>): open_id,
          avatar, display name, username, bio, profile link.
        </li>
        <li>
          <strong>Stats</strong> (<code>user.info.stats</code>): followers, following, likes, video count.
        </li>
        <li>
          <strong>Post list</strong> (<code>video.list</code>): public metadata and metrics (views, likes,
          comments, shares).
        </li>
        <li>
          <strong>Publishing</strong> (<code>video.upload</code> / <code>video.publish</code>): sending a photo
          carousel to the connected account, only after you click Publish.
        </li>
        <li>
          <strong>OAuth tokens</strong>: access_token / refresh_token stored server-side, never sent to the
          browser. No TikTok password.
        </li>
      </ul>
      <p>
        Purposes: show your profile and stats, list your posts, publish on your request. We do not sell TikTok
        data. Disconnect / revoke from Settings. Redirect: <code>https://scrollshow.io/tiktok/callback</code>.
      </p>
      <h2>4. Location</h2>
      <p>ScrollShow does not collect GPS location.</p>
      <h2>5. Retention and rights</h2>
      <p>
        Account data is kept while the account exists. TikTok tokens are deleted on disconnect. For access,
        correction, or deletion: <a href="mailto:hello@scrollshow.io">hello@scrollshow.io</a>.
      </p>
      <h2>6. Sharing</h2>
      <p>
        No sale of data. Hosted on Vercel. TikTok receives only the API calls you trigger (connect, read,
        publish).
      </p>
    </div>
  );
}
