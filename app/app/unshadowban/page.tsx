import { TOOLS_ENABLED } from "@/lib/studio-nav";
import { redirect } from "next/navigation";
import { ShadowbanView } from "@/components/studio/views/ShadowbanView";

export default function UnshadowbanPage() {
  if (!TOOLS_ENABLED) redirect("/app/home");
  return <ShadowbanView />;
}
