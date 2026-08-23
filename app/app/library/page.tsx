"use client";

import { useEffect, useState } from "react";

type Account = {
  id: string;
  handle: string;
  niche: string;
  followers: number;
  avgViews: number;
  verdict: "keep" | "watch" | "skip";
  notes: string;
};

export default function LibraryPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/accounts");
    const json = await res.json();
    setAccounts(json.accounts || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle }),
    });
    if (res.status === 402) {
      setError("Limite Free atteinte (10 comptes). Passe Pro pour continuer.");
      return;
    }
    if (!res.ok) {
      setError("Handle invalide.");
      return;
    }
    setHandle("");
    load();
  }

  async function setVerdict(id: string, verdict: Account["verdict"]) {
    await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verdict }),
    });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <h1 className="serif text-4xl">Bibliothèque</h1>
      <form onSubmit={add} className="mt-6 flex gap-3">
        <input
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          placeholder="@compte.tiktok"
        />
        <button className="btn btn-gold shrink-0">Ajouter</button>
      </form>
      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      <div className="mt-6 space-y-3">
        {accounts.map((account) => (
          <article key={account.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <a
                  href={`https://www.tiktok.com/@${account.handle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-lg font-medium"
                >
                  @{account.handle}
                </a>
                <p className="text-sm text-[var(--muted)]">
                  {account.niche || "Sans niche"} · {account.followers.toLocaleString("fr-FR")}{" "}
                  followers · {account.avgViews.toLocaleString("fr-FR")} vues moy.
                </p>
                {account.notes ? <p className="mt-2 text-sm">{account.notes}</p> : null}
              </div>
              <div className="flex gap-2">
                {(["keep", "watch", "skip"] as const).map((value) => (
                  <button
                    key={value}
                    onClick={() => setVerdict(account.id, value)}
                    className={`rounded-full px-3 py-1 text-xs ${
                      account.verdict === value
                        ? "bg-[var(--gold)] text-black"
                        : "border border-[var(--line)]"
                    }`}
                  >
                    {value}
                  </button>
                ))}
                <button onClick={() => remove(account.id)} className="text-xs text-[var(--muted)]">
                  Retirer
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
