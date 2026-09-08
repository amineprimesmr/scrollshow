import { readSession } from "@/lib/auth";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Bienvenue",
  description: "Dis-nous quel business tu développes, ScrollShow s'adapte.",
};

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const user = await readSession();
  if (!user) redirect("/signup?next=/onboarding");
  return children;
}
