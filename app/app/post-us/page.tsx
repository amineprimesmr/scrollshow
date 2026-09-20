import { TOOLS_ENABLED } from "@/lib/studio-nav";
import { redirect } from "next/navigation";
import { PostUSView } from "@/components/studio/views/PostUSView";

export default function PostUSPage() {
  if (!TOOLS_ENABLED) redirect("/app/home");
  return <PostUSView />;
}
