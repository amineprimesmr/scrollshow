import { findUserByEmail, updateStoreSlice } from "@/lib/store";
import type { User } from "@/lib/types";

export type GoogleProfile = { googleId: string; email: string; name: string };

/** Cree ou rattache le compte Google (partage par le callback OAuth et One Tap). */
export function upsertGoogleUser(profile: GoogleProfile) {
  return updateStoreSlice([], (data) => {
    if (data.restoreReviewRequired) throw new Error("restoration_review_required");
    const existing =
      data.users.find((item) => item.googleId === profile.googleId) ||
      findUserByEmail(data, profile.email);
    if (existing) {
      if (existing.deletionPendingAt) throw new Error("account_deletion_pending");
      if (!existing.emailVerifiedAt && !existing.googleId && !existing.githubId) {
        existing.passwordHash = undefined;
        existing.sessionVersion = (existing.sessionVersion || 0) + 1;
      }
      existing.emailVerifiedAt = new Date().toISOString();
      existing.googleId = profile.googleId;
      if (profile.name && !existing.name) existing.name = profile.name;
      return existing;
    }
    const created: User = {
      id: crypto.randomUUID(),
      email: profile.email,
      name: profile.name,
      googleId: profile.googleId,
      emailVerifiedAt: new Date().toISOString(),
      plan: "free" as const,
      createdAt: new Date().toISOString(),
    };
    data.users.push(created);
    return created;
  });
}
