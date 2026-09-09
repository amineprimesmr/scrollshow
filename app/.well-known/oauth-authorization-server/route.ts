import { OAUTH_SCOPE, SITE } from "@/lib/oauth";

/** RFC 8414 : metadonnees du serveur d'autorisation. */
export function GET() {
  return Response.json(
    {
      issuer: SITE,
      authorization_endpoint: `${SITE}/oauth/authorize`,
      token_endpoint: `${SITE}/api/oauth/token`,
      registration_endpoint: `${SITE}/api/oauth/register`,
      revocation_endpoint: `${SITE}/api/oauth/revoke`,
      scopes_supported: [OAUTH_SCOPE],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      // PKCE S256 seulement : « plain » est interdit par OAuth 2.1.
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      // RFC 9207 : on renvoie « iss », le client peut donc detecter un melange.
      authorization_response_iss_parameter_supported: true,
      service_documentation: `${SITE}/SKILL.md`,
    },
    { headers: { "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" } },
  );
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "*" },
  });
}
