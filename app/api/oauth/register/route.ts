import { registerClient, usableRedirectUri } from "@/lib/oauth";
import { consumeLimit, consumePublicAuthLimit } from "@/lib/rate-limit";
import { z } from "zod";

const schema = z.object({
  client_name: z.string().max(80).optional(),
  client_uri: z.string().max(200).optional(),
  redirect_uris: z.array(z.string().max(500)).min(1).max(10),
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** RFC 7591 : un agent inconnu s'enregistre seul avant d'ouvrir le navigateur. */
export async function POST(request: Request) {
  if (!await consumePublicAuthLimit(request, "oauth-register")) return Response.json({ error: "rate_limited" }, { status: 429 });
  // L'enregistrement est anonyme par nature : on le limite par adresse.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await consumeLimit(`oauth-register:${ip}`, 20, 3600000))) {
    return Response.json({ error: "temporarily_unavailable" }, { status: 429, headers: cors });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_client_metadata" }, { status: 400, headers: cors });
  }

  const redirectUris = parsed.data.redirect_uris.filter(usableRedirectUri);
  if (!redirectUris.length) {
    return Response.json(
      { error: "invalid_redirect_uri", error_description: "Redirect URIs must be HTTPS, a loopback address or an application scheme." },
      { status: 400, headers: cors },
    );
  }

  const client = await registerClient({
    name: parsed.data.client_name || "Agent",
    redirectUris,
    uri: parsed.data.client_uri,
  });

  return Response.json(
    {
      client_id: client.id,
      client_name: client.name,
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      client_id_issued_at: Math.floor(Date.parse(client.createdAt) / 1000),
    },
    { status: 201, headers: cors },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
