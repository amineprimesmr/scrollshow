import { redirect } from "next/navigation";

// Cette page vit maintenant dans Reglages > Revenus. La route reste pour les
// anciens liens et les retours OAuth : les parametres sont conserves.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = new URLSearchParams({ tab: "revenue" });
  for (const [key, value] of Object.entries(await searchParams)) {
    if (key !== "tab" && typeof value === "string") query.set(key, value);
  }
  redirect(`/app/settings?${query}`);
}
