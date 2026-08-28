import { AutomationWizardView } from "@/components/studio/views/AutomationWizardView";

type Props = { params: Promise<{ id: string }> };

export default async function AutomationEditPage({ params }: Props) {
  const { id } = await params;
  return <AutomationWizardView automationId={id} />;
}
