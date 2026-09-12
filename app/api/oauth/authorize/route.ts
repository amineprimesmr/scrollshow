import { readSession } from "@/lib/auth";
import { canonicalResource, findClient, issueCode, OAUTH_SCOPE, SITE } from "@/lib/oauth";
import { consumeLimit } from "@/lib/rate-limit";

/** Decision de l'utilisateur sur l'ecran de consentement. */
export async function POST(request: Request) {
  const form = await request.formData();
  const value = (key: string) => String(form.get(key) || "");

  const clientId = value("client_id");
  const redirectUri = value("redirect_uri");
  const client = clientId ? await findClient(clientId) : null;

  // Meme garde que sur la page : sans client ni adresse verifies, on ne
  // redirige nulle part.
  if (!client || !redirectUri || !client.redirectUris.includes(redirectUri)) {
    return new Response("invalid_client", { status: 400 });
  }

  const url = new URL(redirectUri);
  const state = value("state");
  if (state) url.searchParams.set("state", state);
  url.searchParams.set("iss", SITE);

  const fail = (error: string, description: string) => {
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    return Response.redirect(url.toString(), 303);
  };

  const user = await readSession();
  if (!user) return fail("access_denied", "The ScrollShow session expired before the decision.");
  if (value("decision") !== "allow") return fail("access_denied", "The user declined the request.");

  if (!(await consumeLimit(`oauth-authorize:${user.id}`, 30, 3600000))) {
    return fail("temporarily_unavailable", "Too many authorization attempts. Try again later.");
  }

  const resource = canonicalResource(value("resource"));
  const codeChallenge = value("code_challenge");
  if (!resource) return fail("invalid_target", "Unknown resource.");
  if (codeChallenge.length < 43) return fail("invalid_request", "Missing PKCE challenge.");

  const code = await issueCode({
    clientId: client.id,
    userId: user.id,
    projectId: value("project_id") || user.projectId,
    redirectUri,
    codeChallenge,
    resource,
    scope: value("scope") || OAUTH_SCOPE,
  });

  url.searchParams.set("code", code);
  return Response.redirect(url.toString(), 303);
}
