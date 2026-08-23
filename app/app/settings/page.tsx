import { readSession } from "@/lib/auth";

export default async function SettingsPage() {
  const user = await readSession();
  if (!user) return null;
  return (
    <div className="max-w-xl">
      <h1 className="serif text-4xl">Réglages</h1>
      <div className="card mt-6 space-y-3 p-6">
        <p>
          <span className="text-[var(--muted)]">Nom</span>
          <br />
          {user.name}
        </p>
        <p>
          <span className="text-[var(--muted)]">Email</span>
          <br />
          {user.email}
        </p>
        <p>
          <span className="text-[var(--muted)]">Plan</span>
          <br />
          {user.plan === "pro" ? "Pro" : "Free · 10 comptes"}
        </p>
      </div>
    </div>
  );
}
