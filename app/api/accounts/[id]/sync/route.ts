import { readStudioSession as readSession } from "@/lib/auth";
import { readStoreSlice, updateStoreSlice } from "@/lib/store";
import { fetchTikTokProfile, ProfileError } from "@/lib/tiktok-profile";
import { NextResponse } from "next/server";
import { consumeLimit } from "@/lib/rate-limit";
import { inScope } from "@/lib/projects";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  if (!await consumeLimit(`profile-sync:${user.id}`, 30, 3600000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const source = (await readStoreSlice(["accounts"])).accounts.find(item => item.id === id && inScope(item, user));
  if (!source) return NextResponse.json({ error: "missing" }, { status: 404 });
  // Fetch outside the row lock; recheck ownership and handle when committing.
  let profile: Awaited<ReturnType<typeof fetchTikTokProfile>> | undefined;
  let syncError: string | undefined;
  try { profile = await fetchTikTokProfile(source.handle); }
  catch (error) { syncError = error instanceof ProfileError ? error.code : "network"; }
  const account = await updateStoreSlice(["accounts"], data => {
    const found = data.accounts.find(item => item.id === id && inScope(item, user) && item.handle === source.handle);
    if (!found) return null;
    if (profile) {
      found.handle = profile.handle;
      found.nickname = profile.nickname;
      found.avatar = profile.avatar;
      found.bio = profile.bio;
      found.verified = profile.verified;
      if (profile.followers !== null) found.followers = profile.followers;
      if (profile.likes !== null) found.likes = profile.likes;
      if (profile.videos !== null) found.posts = profile.videos;
    }
    found.lastSyncAt = new Date().toISOString();
    found.syncError = syncError;
    const { videos: _videos, ...summary } = found;
    return summary;
  });

  if (!account) return NextResponse.json({ error: "missing" }, { status: 404 });
  return NextResponse.json({ account });
}
