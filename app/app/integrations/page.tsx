import { IntegrationsView } from "@/components/studio/StudioPages";
import { platformAvailability } from "@/lib/platforms";

export default function Page() {
  return <IntegrationsView availability={platformAvailability()} />;
}
