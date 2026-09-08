import { readStudioSession as readSession } from "@/lib/auth";
import { consumeLimit } from "@/lib/rate-limit";
import { checkQrCode, createQrCode } from "@/lib/tiktok";
import { linkTikTokAccount } from "@/lib/tiktok-link";
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export const runtime = "nodejs";

// Le QR se scanne depuis l'app TikTok du téléphone, où l'utilisateur est déjà
// connecté. La session reste celle du navigateur qui a demandé le code : le
// téléphone n'a jamais besoin d'ouvrir ScrollShow.
const sessions = new Map<string, { userId: string; state: string; ticket: string; createdAt: number }>();
const TTL = 10 * 60 * 1000;

function sweep() {
  const now = Date.now();
  for (const [token, entry] of sessions) if (now - entry.createdAt > TTL) sessions.delete(token);
}

export async function POST() {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await consumeLimit(`tiktok-qr:${user.id}`, 10, 60_000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  sweep();
  const state = `ss_${user.id}_${randomUUID()}`;
  const ticket = randomUUID();
  try {
    const { scanUrl, token } = await createQrCode(state);
    sessions.set(token, { userId: user.id, state, ticket, createdAt: Date.now() });
    // TikTok renvoie l'URL avec « client_ticket=tobefilled » à remplacer par le nôtre.
    const url = scanUrl.replace("tobefilled", ticket);
    // Le QR est rendu côté serveur : rien à charger dans le bundle du studio.
    const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
    return NextResponse.json({ token, scanUrl: url, svg });
  } catch {
    return NextResponse.json({ error: "qr_unavailable" }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = z.object({ token: z.string().min(1).max(400) }).safeParse({
    token: new URL(request.url).searchParams.get("token") || "",
  });
  if (!parsed.success) return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  const entry = sessions.get(parsed.data.token);
  // Un QR n'appartient qu'à la session qui l'a demandé.
  if (!entry || entry.userId !== user.id) return NextResponse.json({ status: "expired" });
  if (Date.now() - entry.createdAt > TTL) {
    sessions.delete(parsed.data.token);
    return NextResponse.json({ status: "expired" });
  }
  if (!(await consumeLimit(`tiktok-qr-poll:${user.id}`, 240, 60_000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  try {
    const result = await checkQrCode(parsed.data.token);
    if (result.status !== "confirmed") return NextResponse.json({ status: result.status });
    // Intégrité : le ticket et l'état doivent être ceux que nous avons émis.
    if ((result.clientTicket && result.clientTicket !== entry.ticket) || (result.state && result.state !== entry.state)) {
      sessions.delete(parsed.data.token);
      return NextResponse.json({ error: "state_mismatch" }, { status: 400 });
    }
    if (!result.code) return NextResponse.json({ status: "scanned" });
    sessions.delete(parsed.data.token);
    const account = await linkTikTokAccount(user, result.code);
    return NextResponse.json({ status: "connected", account });
  } catch {
    return NextResponse.json({ error: "qr_unavailable" }, { status: 502 });
  }
}
