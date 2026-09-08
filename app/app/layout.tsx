import { readSession } from "@/lib/auth";
import { hasStudioAccess } from "@/lib/plans";
import { redirect } from "next/navigation";
import { StudioShell } from "@/components/studio/StudioShell";
import "../studio.css";
import "../liquid-glass.css";

// Resolve current stored entitlements: a signed cookie can outlive a refund,
// deleted account or password change.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await readSession();
  if (!user) redirect("/signup?mode=signin&next=/pricing");
  if (!user.emailVerified) redirect("/verify-email");
  if (!user.onboarded) redirect("/onboarding?next=/app");
  if (!hasStudioAccess(user.plan)) redirect("/pricing");
  return <StudioShell>{children}</StudioShell>;
}
