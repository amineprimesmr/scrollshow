"use client";

import { useState } from "react";

type Account = { handle: string; notes: string };

export default function DiscoverPage() {
  const [keywords, setKeywords] = useState("");
  const [pending, setPending] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords }),
    });
    const json = await res.json();
    setAccounts(json.accounts || []);
    setPending(false);
  }

  return (
    <div>
      <h1 className="serif text-4xl">Découverte</h1>
      <p className="mt-3 max-w-xl text-[var(--muted)]">
        Entre une niche. ScrollShow ouvre une recherche et range des pistes dans ta bibliothèque.
        Remplace ensuite les handles par les vrais @ TikTok que tu veux suivre.
      </p>
      <form onSubmit={run} className="mt-6 flex gap-3">
        <input
          value={keywords}
          onChange={(event) => setKeywords(event.target.value)}
          placeholder="glow up, bloating, morning routine…"
        />
        <button className="btn btn-gold shrink-0" disabled={pending}>
          {pending ? "…" : "Lancer"}
        </button>
      </form>
      <div className="mt-6 space-y-3">
        {accounts.map((account) => (
          <div key={account.handle} className="card p-5">
            <p className="font-medium">@{account.handle}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{account.notes}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
