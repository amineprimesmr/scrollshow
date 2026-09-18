import { readStudioSession as readSession } from "@/lib/auth";
import { applyManageAction, listManagedAccounts, MANAGE_MAX_KEYS } from "@/lib/account-manage";
import { revokeMetaToken } from "@/lib/meta";
import { consumeLimit } from "@/lib/rate-limit";
import { readStoreSlice, updateStoreSlice } from "@/lib/store";
import { revokeAccessToken } from "@/lib/tiktok";
import { revokeXToken } from "@/lib/x";
import type { Channel } from "@/lib/types";
import { NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 60;

const privateHeaders = { "Cache-Control": "private, no-store" };

const schema = z.object({
  action: z.enum(["hide", "show", "remove"]),
  keys: z.array(z.string().min(4).max(140)).min(1).max(MANAGE_MAX_KEYS),
});

/** Tous les comptes du projet, masques compris : c'est le seul endroit qui les liste. */
export async function GET() {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: privateHeaders });
  const data = await readStoreSlice(["accounts", "channels", "posts"], { userId: user.id });
  return NextResponse.json({ accounts: listManagedAccounts(data, user) }, { headers: privateHeaders });
}

async function revoke(channel: Channel) {
  if (!channel.accessToken) return;
  if (channel.platform === "tiktok") await revokeAccessToken(channel.accessToken);
  else if (channel.platform === "instagram" || channel.platform === "facebook") await revokeMetaToken(channel.accessToken);
  else if (channel.platform === "x") await revokeXToken(channel.accessToken);
}

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: privateHeaders });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400, headers: privateHeaders });
  if (!(await consumeLimit(`accounts-manage:${user.id}`, 60, 600_000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { ...privateHeaders, "Retry-After": "60" } });
  }

  // Une seule ecriture pour tout le lot, portee par l'utilisateur. Les instantanes
  // quotidiens (sans proprietaire) d'un compte connecte supprime partent ensuite.
  const result = await updateStoreSlice(["accounts", "channels"], (data) =>
    applyManageAction(data, user, parsed.data.action, parsed.data.keys), { userId: user.id });
  if (result.removedChannels.length) {
    const gone = new Set(result.removedChannels.map((row) => row.id));
    await updateStoreSlice(["videoStats", "channelStats"], (data) => {
      data.videoStats = data.videoStats?.filter((row) => !gone.has(row.channelId));
      data.channelStats = data.channelStats?.filter((row) => !gone.has(row.channelId));
    });
  }

  // Hors verrou : « supprime » doit aussi vouloir dire que la plateforme ne fait
  // plus confiance a ScrollShow pour ce compte. Au mieux : une revocation qui
  // echoue (jeton deja expire) ne doit pas faire echouer le nettoyage.
  let revoked = 0;
  const queue = [...result.removedChannels];
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    for (let channel = queue.shift(); channel; channel = queue.shift()) {
      try { await revoke(channel); revoked += 1; } catch { /* au mieux */ }
    }
  }));

  const data = await readStoreSlice(["accounts", "channels", "posts"], { userId: user.id });
  return NextResponse.json({
    ok: true, changed: result.changed, missing: result.missing, revoked,
    accounts: listManagedAccounts(data, user),
  }, { headers: privateHeaders });
}
