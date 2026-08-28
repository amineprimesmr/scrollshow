"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import type { Account } from "@/lib/types";

export function LibraryView() {
  const [english, setEnglish] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filter, setFilter] = useState<"all" | "keep" | "watch" | "skip">("all");

  useEffect(() => setEnglish(prefersEnglish()), []);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((json) => setAccounts(json.accounts || []))
      .catch(() => undefined);
  }, []);

  const en = english;
  const filtered = accounts.filter((a) => filter === "all" || a.verdict === filter);

  return (
    <div style={{ padding: "0 24px 48px" }}>
      <p className="ss-lead" style={{ marginBottom: 16 }}>
        {t("Comptes TikTok à reverse-engineer — verdict Keep / Watch / Skip.", "TikTok accounts to reverse-engineer — Keep / Watch / Skip verdicts.", en)}
      </p>
      <div className="ss-segment" style={{ marginBottom: 20 }}>
        {(["all", "keep", "watch", "skip"] as const).map((f) => (
          <button key={f} type="button" className={filter === f ? "is-active" : ""} onClick={() => setFilter(f)}>
            {f === "all" ? t("Tout", "All", en) : f.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="ss-panel">
        {filtered.map((account) => (
          <article key={account.id} style={{ padding: "16px 0", borderBottom: "1px solid #ececec" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>@{account.handle}</strong>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: account.verdict === "keep" ? "#ecfdf5" : account.verdict === "skip" ? "#fef2f2" : "#f4f4f5",
                  color: account.verdict === "keep" ? "#059669" : account.verdict === "skip" ? "#dc2626" : "#52525b",
                }}
              >
                {account.verdict.toUpperCase()}
              </span>
            </div>
            <p style={{ margin: "6px 0", fontSize: 13, color: "#71717a" }}>{account.niche}</p>
            <p style={{ margin: 0, fontSize: 13 }}>
              {account.followers.toLocaleString()} {t("abonnés", "followers", en)} · {account.avgViews.toLocaleString()} {t("vues moy.", "avg views", en)}
            </p>
            {account.notes ? <p style={{ margin: "8px 0 0", fontSize: 13, color: "#52525b" }}>{account.notes}</p> : null}
          </article>
        ))}
        {!filtered.length ? <p className="ss-lead">{t("Aucun compte.", "No accounts yet.", en)}</p> : null}
      </div>
    </div>
  );
}
