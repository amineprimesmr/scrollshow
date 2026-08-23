"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    setPending(false);
    if (res.status === 409) {
      setError("Un compte existe déjà avec cet email.");
      return;
    }
    if (!res.ok) {
      setError("Vérifie les champs (mot de passe 8 caractères min.).");
      return;
    }
    router.push("/app");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="mb-8 text-sm text-[var(--muted)]">
        ← ScrollShow
      </Link>
      <h1 className="serif text-4xl">Créer un espace</h1>
      <p className="mt-3 text-[var(--muted)]">Gratuit. 10 comptes. Ta bibliothèque démarre avec 3 exemples.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <input name="name" required placeholder="Prénom" />
        <input name="email" type="email" required placeholder="Email" />
        <input name="password" type="password" required minLength={8} placeholder="Mot de passe (8+)" />
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <button className="btn btn-gold w-full" disabled={pending}>
          {pending ? "…" : "Créer mon espace"}
        </button>
      </form>
      <p className="mt-6 text-sm text-[var(--muted)]">
        Déjà un compte ? <Link href="/login">Connexion</Link>
      </p>
    </main>
  );
}
