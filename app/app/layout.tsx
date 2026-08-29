import { readSession } from "@/lib/auth";
import { hasStudioAccess } from "@/lib/plans";
import { redirect } from "next/navigation";
import { StudioShell } from "@/components/studio/StudioShell";
import "../studio.css";

// Deliberately uses the fast cookie-only session read (no store/blob fetch) —
// this layout re-executes on every /app/* navigation, and the full user
// record (kept in sync via /api/studio and /api/auth/me client-side) is not
// needed just to gate access, so we avoid a network round trip per click.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await readSession();
  if (!user) redirect("/signup?mode=signin&next=/pricing");
  if (!hasStudioAccess(user.plan)) redirect("/pricing");
  return <StudioShell>{children}</StudioShell>;
}
