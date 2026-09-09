import { readSession } from "@/lib/auth";
import { hasStudioAccess } from "@/lib/plans";
import { canonicalResource, findClient, OAUTH_SCOPE } from "@/lib/oauth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import "./authorize.css";

export const metadata: Metadata = { title: "Autoriser l’accès", robots: { index: false, follow: false } };

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

/**
 * Ecran de consentement. Toute erreur imputable au client est renvoyee a son
 * adresse de redirection, sauf si c'est justement le client ou l'adresse qui
 * sont invalides : dans ce cas on affiche l'erreur ici, jamais de redirection
 * vers une adresse non verifiee (protection contre la redirection ouverte).
 */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const clientId = one(params, "client_id");
  const redirectUri = one(params, "redirect_uri");
  const state = one(params, "state");
  const codeChallenge = one(params, "code_challenge");
  const codeChallengeMethod = one(params, "code_challenge_method");
  const responseType = one(params, "response_type");
  const resource = canonicalResource(one(params, "resource"));

  const client = clientId ? await findClient(clientId) : null;
  if (!client) return <Problem title="Application inconnue" detail="Cette application n’est pas enregistrée auprès de ScrollShow. Relance l’installation depuis ton agent." />;
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return <Problem title="Adresse de retour invalide" detail="L’adresse de retour ne correspond pas à celles déclarées par l’application. Par sécurité, nous n’y renvoyons rien." />;
  }

  const back = (error: string, description: string) => {
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    url.searchParams.set("iss", process.env.NEXT_PUBLIC_SITE_URL || "https://scrollshow.io");
    if (state) url.searchParams.set("state", state);
    redirect(url.toString());
  };

  if (responseType !== "code") back("unsupported_response_type", "Only the authorization code flow is supported.");
  if (codeChallengeMethod !== "S256" || codeChallenge.length < 43) back("invalid_request", "PKCE with S256 is required.");
  if (!resource) back("invalid_target", "The resource parameter must be the ScrollShow MCP server URI.");

  const user = await readSession();
  if (!user) {
    const self = new URL("/oauth/authorize", process.env.NEXT_PUBLIC_SITE_URL || "https://scrollshow.io");
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") self.searchParams.set(key, value);
    }
    redirect(`/signup?mode=signin&next=${encodeURIComponent(self.pathname + self.search)}`);
  }

  return (
    <main className="ss-oauth">
      <div className="ss-oauth__card">
        <span className="ss-oauth__edge" aria-hidden />

        <h1>Autoriser {client.name}</h1>
        <p className="ss-oauth__sub">
          Cette application demande l’accès à ton espace ScrollShow, au nom de <strong>{user.email}</strong>.
        </p>

        <ul className="ss-oauth__perms">
          <li>Lire ton profil business, tes posts et tes statistiques</li>
          <li>Créer, modifier et planifier des carrousels</li>
          <li>Publier uniquement quand tu le demandes</li>
        </ul>

        {hasStudioAccess(user.plan) ? null : (
          <p className="ss-oauth__notice">
            Ton compte n’a pas d’accès actif. Tu peux autoriser dès maintenant : les outils se débloqueront
            automatiquement dès l’activation, sans réinstaller quoi que ce soit.
          </p>
        )}

        <form method="post" action="/api/oauth/authorize" className="ss-oauth__actions">
          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="redirect_uri" value={redirectUri} />
          <input type="hidden" name="code_challenge" value={codeChallenge} />
          <input type="hidden" name="resource" value={resource} />
          <input type="hidden" name="state" value={state} />
          <input type="hidden" name="scope" value={OAUTH_SCOPE} />
          <button type="submit" name="decision" value="deny" className="ss-oauth__deny">Refuser</button>
          <button type="submit" name="decision" value="allow" className="ss-oauth__allow">Autoriser</button>
        </form>

        <p className="ss-oauth__foot">
          Tu pourras retirer cet accès à tout moment depuis Réglages → Compte.
        </p>
      </div>
    </main>
  );
}

function Problem({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="ss-oauth">
      <div className="ss-oauth__card">
        <span className="ss-oauth__edge" aria-hidden />
        <h1>{title}</h1>
        <p className="ss-oauth__sub">{detail}</p>
      </div>
    </main>
  );
}
