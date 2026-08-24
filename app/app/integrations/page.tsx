import { ConnectionsView } from "@/components/studio/ConnectionsView";
import { platformAvailability } from "@/lib/platforms";

export default function Page() {
  return <ConnectionsView availability={platformAvailability()} />;
}
