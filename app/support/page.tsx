import { LegalShell } from "@/components/LegalShell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support",
  description: "ScrollShow support: connect TikTok, disconnect, publish help.",
};

export default function SupportPage() {
  return (
    <LegalShell titleFr="Support" titleEn="Support" childrenFr={<Fr />} childrenEn={<En />} />
  );
}

function Fr() {
  return (
    <div>
      <p>
        ScrollShow est un outil web pour connecter TikTok (Login Kit) et publier des carrousels photo (Content
        Posting API).
      </p>
      <h2>Connexion TikTok</h2>
      <p>
        Crée un compte, choisis un plan sur <a href="https://scrollshow.io/pricing">scrollshow.io/pricing</a>, ouvre le studio, puis
        « Continuer avec TikTok ». La redirection officielle est{" "}
        <code>https://scrollshow.io/tiktok/callback</code>.
      </p>
      <h2>Déconnexion</h2>
      <p>Réglages → Déconnecter. Les jetons OAuth sont révoqués puis supprimés.</p>
      <h2>Contact</h2>
      <p>
        <a href="mailto:hello@scrollshow.io">hello@scrollshow.io</a>
      </p>
    </div>
  );
}

function En() {
  return (
    <div>
      <p>
        ScrollShow is a web tool to connect TikTok (Login Kit) and publish photo carousels (Content Posting API).
      </p>
      <h2>Connect TikTok</h2>
      <p>
        Create an account, pick a plan at <a href="https://scrollshow.io/pricing">scrollshow.io/pricing</a>, open the studio,
        then “Continue with TikTok”. Official redirect: <code>https://scrollshow.io/tiktok/callback</code>.
      </p>
      <h2>Disconnect</h2>
      <p>Settings → Disconnect. OAuth tokens are revoked then deleted.</p>
      <h2>Contact</h2>
      <p>
        <a href="mailto:hello@scrollshow.io">hello@scrollshow.io</a>
      </p>
    </div>
  );
}
