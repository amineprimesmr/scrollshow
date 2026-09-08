import { redirect } from "next/navigation";

/** Billing lives in Settings now; keep the old URL working. */
export default function Page() {
  redirect("/app/settings?tab=plan");
}
