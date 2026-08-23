"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    setPending(false);
    if (!res.ok) {
      setError("Email ou mot de passe incorrect.");
      return;
    }
    router.push("/app");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="mb-8 text-sm text-[var(--muted)]">
        ← ScrollShow
      </Link>
      <h1 className="serif text-4xl">Connexion</h1>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <input name="email" type="email" required placeholder="Email" />
        <input name="password" type="password" required placeholder="Mot de passe" />
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <button className="btn btn-gold w-full" disabled={pending}>
          {pending ? "…" : "Entrer"}
        </button>
      </form>
      <p className="mt-6 text-sm text-[var(--muted)]">
        Pas de compte ? <Link href="/signup">Créer un espace</Link>
      </p>
    </main>
  );
}
