import { redirect } from "next/navigation";

// Analytics now live in the Overview account panel.
export default function Page() {
  redirect("/app/home");
}
