import { signupUrl } from "@/lib/auth-urls";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  redirect(signupUrl({ mode: "signin", next }));
}
