import { TOOLS_ENABLED } from "@/lib/studio-nav";
import { redirect } from "next/navigation";
import { WarmedAccountsLocked } from "@/components/studio/views/MoreViews";

export default function WarmedAccountsPage() {
  if (!TOOLS_ENABLED) redirect("/app/home");
  return <WarmedAccountsLocked />;
}
