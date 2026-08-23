import { readSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { StudioShell } from "@/components/studio/StudioShell";
import "../studio.css";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await readSession();
  if (!user) redirect("/login");
  return <StudioShell>{children}</StudioShell>;
}
