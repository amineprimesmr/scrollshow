import { MCP_RESOURCE, OAUTH_SCOPE, SITE } from "@/lib/oauth";

/** RFC 9728 : le serveur MCP publie ou trouver son serveur d'autorisation. */
export function GET() {
  return Response.json(
    {
      resource: MCP_RESOURCE,
      authorization_servers: [SITE],
      scopes_supported: [OAUTH_SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: "ScrollShow",
      resource_documentation: `${SITE}/SKILL.md`,
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
