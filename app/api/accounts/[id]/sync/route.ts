import { readStudioSession as readSession } from "@/lib/auth";
import { updateStore } from "@/lib/store";
import { fetchTikTokProfile, ProfileError } from "@/lib/tiktok-profile";
import { NextResponse } from "next/server";
import { inScope } from "@/lib/projects";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const account = await updateStore(async (data) => {
    const found = data.accounts.find((item) => item.id === id && inScope(item, user));
    if (!found) return null;
    try {
      const profile = await fetchTikTokProfile(found.handle);
      found.handle = profile.handle;
      found.nickname = profile.nickname;
      found.avatar = profile.avatar;
      found.bio = profile.bio;
      found.verified = profile.verified;
      // Un compteur absent de la page laisse la derniere mesure en place.
      if (profile.followers !== null) found.followers = profile.followers;
      if (profile.likes !== null) found.likes = profile.likes;
      if (profile.videos !== null) found.posts = profile.videos;
      found.lastSyncAt = new Date().toISOString();
      found.syncError = undefined;
    } catch (error) {
      found.syncError = error instanceof ProfileError ? error.code : "network";
      found.lastSyncAt = new Date().toISOString();
    }
    return found;
  });

  if (!account) return NextResponse.json({ error: "missing" }, { status: 404 });
  return NextResponse.json({ account });
}
