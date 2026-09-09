import { readStudioSession as readSession } from "@/lib/auth";
import { checkConnectedAccount, checkLibraryAccount, checkPublicAccount, ShadowbanLookupError } from "@/lib/shadowban-check";
import { readStore } from "@/lib/store";
import { loadTikTokChannels } from "@/lib/tiktok-account";
import { NextResponse } from "next/server";
import { inScope } from "@/lib/projects";

function errorCode(error: unknown) {
  if (error instanceof ShadowbanLookupError) return error.code;
  return error instanceof Error ? error.message : "shadowban_failed";
}

/**
 * GET  /api/tiktok/shadowban              → every connected + library TikTok account, analyzed
 * GET  /api/tiktok/shadowban?key=ch:<id>  → one connected account
 * GET  /api/tiktok/shadowban?key=ac:<id>  → one library account (public posts)
 * POST /api/tiktok/shadowban {handle}     → one-off public check, nothing stored
 */
export async function GET(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const key = new URL(request.url).searchParams.get("key") || "";
  const [kind, id] = key.includes(":") ? key.split(":", 2) : ["", ""];

  const channels = kind === "ac" ? [] : (await loadTikTokChannels(user.id, user.projectId)).filter((c) => !id || c.id === id);
  const store = await readStore();
  const accounts = kind === "ch" ? [] : store.accounts.filter((a) => inScope(a, user) && (!id || a.id === id));
  if (key && !channels.length && !accounts.length) return NextResponse.json({ error: "missing" }, { status: 404 });

  const results = await Promise.all([
    ...channels.map(async (channel) => {
      try {
        return await checkConnectedAccount(channel);
      } catch (error) {
        return { key: `ch:${channel.id}`, source: "connected" as const, handle: channel.handle, name: channel.name || channel.handle, avatar: channel.avatar || "", followers: channel.followers || 0, error: errorCode(error) };
      }
    }),
    ...accounts.map(async (account) => {
      try {
        return await checkLibraryAccount(account);
      } catch (error) {
        return { key: `ac:${account.id}`, source: "library" as const, handle: account.handle, name: account.nickname || account.handle, avatar: account.avatar || "", followers: account.followers || 0, error: errorCode(error) };
      }
    }),
  ]);
  return NextResponse.json({ accounts: results });
}

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const handle = typeof body?.handle === "string" ? body.handle : "";
  try {
    return NextResponse.json({ account: await checkPublicAccount(handle) });
  } catch (error) {
    if (error instanceof ShadowbanLookupError) {
      const status = error.code === "not_found" ? 404 : error.code === "invalid_handle" ? 400 : 503;
      return NextResponse.json({ error: error.code }, { status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "lookup_failed" }, { status: 500 });
  }
}
