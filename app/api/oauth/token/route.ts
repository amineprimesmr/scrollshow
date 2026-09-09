import { hasStudioAccess } from "@/lib/plans";
import { readStore } from "@/lib/store";
import {
  canonicalResource,
  consumeCode,
  issueTokens,
  OAUTH_SCOPE,
  rotateRefreshToken,
  verifyPkce,
} from "@/lib/oauth";
import { consumeLimit } from "@/lib/rate-limit";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store",
};

function fail(error: string, description: string, status = 400) {
  return Response.json({ error, error_description: description }, { status, headers: cors });
}

/** Echange du code, puis renouvellement. Clients publics : PKCE fait foi. */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return fail("invalid_request", "Expected application/x-www-form-urlencoded.");
  const value = (key: string) => String(form.get(key) || "").trim();

  const clientId = value("client_id");
  if (!clientId) return fail("invalid_client", "Missing client_id.", 401);
  if (!(await consumeLimit(`oauth-token:${clientId}`, 120, 3600000))) {
    return fail("temporarily_unavailable", "Too many token requests.", 429);
  }

  const grantType = value("grant_type");

  if (grantType === "authorization_code") {
    const code = value("code");
    const verifier = value("code_verifier");
    if (!code || !verifier) return fail("invalid_request", "Missing code or code_verifier.");

    const record = await consumeCode(code);
    if (!record) return fail("invalid_grant", "The authorization code is unknown, used or expired.");
    if (record.clientId !== clientId) return fail("invalid_grant", "This code was issued to another client.");
    if (record.redirectUri !== value("redirect_uri")) return fail("invalid_grant", "redirect_uri does not match the authorization request.");
    if (!verifyPkce(verifier, record.codeChallenge)) return fail("invalid_grant", "PKCE verification failed.");

    // RFC 8707 : si le client redemande une ressource, ce doit etre la meme.
    const asked = value("resource");
    if (asked && canonicalResource(asked) !== record.resource) return fail("invalid_target", "resource does not match the authorization request.");

    const tokens = await issueTokens({
      clientId,
      userId: record.userId,
      resource: record.resource,
      scope: record.scope,
    });
    return Response.json(
      { access_token: tokens.accessToken, token_type: "Bearer", expires_in: tokens.expiresIn, refresh_token: tokens.refreshToken, scope: record.scope },
      { headers: cors },
    );
  }

  if (grantType === "refresh_token") {
    const refresh = value("refresh_token");
    if (!refresh) return fail("invalid_request", "Missing refresh_token.");
    const outcome = await rotateRefreshToken(refresh, clientId);
    if ("error" in outcome) {
      return fail("invalid_grant", outcome.error === "replay"
        ? "This refresh token was already used. The whole authorization has been revoked."
        : "The refresh token is unknown or expired.");
    }

    const grant = outcome.grant;
    // Le compte peut avoir disparu entre-temps : on relit avant de reconduire.
    const data = await readStore();
    const user = data.users.find((item) => item.id === grant.userId);
    if (!user || user.deletionPendingAt || !user.emailVerifiedAt) {
      return fail("invalid_grant", "The ScrollShow account is no longer available.");
    }

    const tokens = await issueTokens({
      clientId,
      userId: grant.userId,
      resource: grant.resource,
      scope: grant.scope || OAUTH_SCOPE,
      grantId: grant.grantId,
    });
    return Response.json(
      { access_token: tokens.accessToken, token_type: "Bearer", expires_in: tokens.expiresIn, refresh_token: tokens.refreshToken, scope: grant.scope || OAUTH_SCOPE },
      { headers: cors },
    );
  }

  return fail("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
