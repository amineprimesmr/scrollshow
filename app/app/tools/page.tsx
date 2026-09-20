import { TOOLS_ENABLED } from "@/lib/studio-nav";
import { redirect } from "next/navigation";
import { ToolsView } from "@/components/studio/views/ToolsView";

export default function ToolsPage() {
  if (!TOOLS_ENABLED) redirect("/app/home");
  return <ToolsView />;
}
