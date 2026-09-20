import { redirect } from "next/navigation";

// The public mockup that used to live here simulated a TikTok publish with a
// preselected privacy and no creator_info — the opposite of TikTok's required
// UX. A reviewer must only ever see the real flow, so the URL now lands on it.
export default function ReviewPage() {
  redirect("/login?next=/app");
}
