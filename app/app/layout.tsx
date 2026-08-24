import { refreshSessionFromStore } from "@/lib/auth";
import { hasStudioAccess } from "@/lib/plans";
import { redirect } from "next/navigation";
import { StudioShell } from "@/components/studio/StudioShell";
import "../studio.css";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await refreshSessionFromStore();
  if (!user) redirect("/signup?mode=signin&next=/pricing");
  if (!hasStudioAccess(user.plan)) redirect("/pricing");
  return <StudioShell>{children}</StudioShell>;
}
