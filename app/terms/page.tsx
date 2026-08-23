import { LegalShell } from "@/components/LegalShell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "ScrollShow terms: connect TikTok via Login Kit and publish photo carousels with the Content Posting API.",
};

export default function TermsPage() {
  return (
    <LegalShell titleFr="Conditions d’utilisation" titleEn="Terms of Service" childrenFr={<Fr />} childrenEn={<En />} />
  );
}

function Fr() {
  return (
    <div>
      <p>
        Les présentes conditions régissent l’accès à <strong>ScrollShow</strong> (
        <a href="https://scrollshow.io">https://scrollshow.io</a>), un outil web pour les créateurs TikTok.
        En créant un compte ou en utilisant le service, vous acceptez ces conditions.
      </p>
      <h2>1. Objet</h2>
      <p>
        ScrollShow permet de <strong>connecter un compte TikTok</strong> via le Login Kit officiel, de consulter
        le profil, les statistiques et la liste des posts, puis de <strong>publier des carrousels photo</strong> via
        l’API Content Posting TikTok (Direct Post). Vous restez responsable du contenu publié et du respect des
        Community Guidelines TikTok.
      </p>
      <h2>2. Compte</h2>
      <ul>
        <li>Vous créez un compte avec e-mail et mot de passe.</li>
        <li>Vous êtes responsable de votre session.</li>
        <li>
          Vous pouvez demander la suppression de votre compte à <a href="mailto:hello@scrollshow.io">hello@scrollshow.io</a>.
        </li>
      </ul>
      <h2>3. TikTok</h2>
      <p>
        La connexion TikTok est optionnelle. Elle utilise OAuth (Login Kit) et les scopes :{" "}
        <code>user.info.basic</code>, <code>user.info.profile</code>, <code>user.info.stats</code>,{" "}
        <code>video.list</code>, <code>video.upload</code>, <code>video.publish</code>. Aucun mot de passe TikTok
        n’est collecté. La publication n’a lieu qu’après une action explicite dans l’app.
      </p>
      <p>
        Redirection OAuth : <code>https://scrollshow.io/tiktok/callback</code>. Déconnexion et révocation du jeton
        depuis Réglages.
      </p>
      <h2>4. Utilisation acceptable</h2>
      <ul>
        <li>Pas d’usage illégal, spam, harcèlement, ou contournement de sécurité.</li>
        <li>Pas de publication de contenus interdits par TikTok ou la loi.</li>
        <li>Pas de revente du service ni d’accès non autorisé aux APIs.</li>
      </ul>
      <h2>5. Disponibilité et responsabilité</h2>
      <p>
        Le service est fourni « en l’état ». Nous ne garantissons pas une disponibilité ininterrompue. Dans les
        limites légales, la responsabilité de ScrollShow est limitée aux montants payés sur les 12 derniers mois.
      </p>
      <h2>6. Droit applicable</h2>
      <p>Droit français. Tribunaux français, sous réserve des règles impératives de protection des consommateurs.</p>
      <h2>7. Contact</h2>
      <p>
        <a href="mailto:hello@scrollshow.io">hello@scrollshow.io</a> · <a href="https://scrollshow.io/support">Support</a> ·{" "}
        <a href="https://scrollshow.io/privacy">Confidentialité</a>
      </p>
    </div>
  );
}

function En() {
  return (
    <div>
      <p>
        These terms govern access to <strong>ScrollShow</strong> (
        <a href="https://scrollshow.io">https://scrollshow.io</a>), a web tool for TikTok creators. By creating an
        account or using the service, you agree to these terms.
      </p>
      <h2>1. Purpose</h2>
      <p>
        ScrollShow lets you <strong>connect a TikTok account</strong> via official Login Kit, view profile, stats,
        and posts, then <strong>publish photo carousels</strong> via the TikTok Content Posting API (Direct Post).
        You remain responsible for published content and TikTok Community Guidelines.
      </p>
      <h2>2. Account</h2>
      <ul>
        <li>You create an account with email and password.</li>
        <li>You are responsible for your session.</li>
        <li>
          You may request account deletion at <a href="mailto:hello@scrollshow.io">hello@scrollshow.io</a>.
        </li>
      </ul>
      <h2>3. TikTok</h2>
      <p>
        TikTok connection is optional. It uses OAuth (Login Kit) and scopes: <code>user.info.basic</code>,{" "}
        <code>user.info.profile</code>, <code>user.info.stats</code>, <code>video.list</code>,{" "}
        <code>video.upload</code>, <code>video.publish</code>. We never collect your TikTok password. Publishing
        happens only after an explicit action in the app.
      </p>
      <p>
        OAuth redirect: <code>https://scrollshow.io/tiktok/callback</code>. Disconnect and token revoke from
        Settings.
      </p>
      <h2>4. Acceptable use</h2>
      <ul>
        <li>No illegal use, spam, harassment, or security circumvention.</li>
        <li>No content banned by TikTok or by law.</li>
        <li>No resale of the service or unauthorized API access.</li>
      </ul>
      <h2>5. Availability and liability</h2>
      <p>
        The service is provided as-is. We do not guarantee uninterrupted availability. To the extent allowed by
        law, ScrollShow’s liability is limited to amounts paid in the last 12 months.
      </p>
      <h2>6. Governing law</h2>
      <p>French law. French courts, subject to mandatory consumer-protection rules.</p>
      <h2>7. Contact</h2>
      <p>
        <a href="mailto:hello@scrollshow.io">hello@scrollshow.io</a> · <a href="https://scrollshow.io/support">Support</a> ·{" "}
        <a href="https://scrollshow.io/privacy">Privacy</a>
      </p>
    </div>
  );
}
