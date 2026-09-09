import { readSession } from "@/lib/auth";
import { hasStudioAccess } from "@/lib/plans";
import { listGrants } from "@/lib/oauth";
import { Atmosphere } from "@/components/Atmosphere";
import { BrandMark } from "@/components/BrandMark";
import { AgentConnectStatus } from "@/components/AgentConnectStatus";
import Link from "next/link";
import type { Metadata } from "next";
import "./connect.css";

export const metadata: Metadata = {
  title: "Ton assistant ScrollShow",
  description: "Connecte ton assistant à ton espace ScrollShow.",
  robots: { index: false, follow: false },
};

export default async function ConnectPage() {
  const user = await readSession();
  const initial = {
    account: user ? { email: user.email, active: hasStudioAccess(user.plan) } : null,
    grants: user ? await listGrants(user.id) : [],
  };
  return <main className="ss-connect">
    <Atmosphere />
    <section className="ss-connect__inner">
      <Link href="/" className="ss-connect__brand" aria-label="ScrollShow, accueil"><BrandMark size={20} />ScrollShow</Link>
      <AgentConnectStatus initial={initial} />
    </section>
  </main>;
}
