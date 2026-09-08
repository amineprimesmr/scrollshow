"use client";

import { t } from "@/lib/i18n";
import type { Account } from "@/lib/types";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStudio } from "../StudioContext";

type Verdict = Account["verdict"];
type Filter = "all" | Verdict;

const VERDICT: Record<Verdict, { fr: string; en: string; cls: string }> = {
  keep: { fr: "Keep", en: "Keep", cls: "is-ready" },
  watch: { fr: "Watch", en: "Watch", cls: "is-review" },
  skip: { fr: "Skip", en: "Skip", cls: "is-wait" },
};

function fmt(n: number | undefined, en: boolean) {
  return Math.round(n || 0).toLocaleString(en ? "en-US" : "fr-FR");
}

function since(iso: string | undefined, en: boolean) {
  if (!iso) return en ? "never" : "jamais";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return en ? `${mins} min ago` : `il y a ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return en ? `${hours} h ago` : `il y a ${hours} h`;
  return new Date(iso).toLocaleDateString(en ? "en-US" : "fr-FR");
}

function syncErrorCopy(code: string | undefined, en: boolean) {
  if (!code) return "";
  if (code === "not_found") return t("Compte introuvable sur TikTok", "Account not found on TikTok", en);
  if (code === "blocked") return t("TikTok a bloqué la lecture, réessaie plus tard", "TikTok blocked the read, retry later", en);
  return t("Réseau indisponible", "Network unavailable", en);
}

export function ClippersView() {
  const { english: en } = useStudio();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [handle, setHandle] = useState("");
  const [niche, setNiche] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState("");

  useEffect(() => {
    fetch("/api/accounts")
      .then((res) => res.json())
      .then((json) => setAccounts(json.accounts || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => accounts.filter((a) => filter === "all" || a.verdict === filter).sort((a, b) => (b.followers || 0) - (a.followers || 0)),
    [accounts, filter],
  );

  const totals = useMemo(
    () => ({
      count: accounts.length,
      keep: accounts.filter((a) => a.verdict === "keep").length,
      followers: accounts.reduce((n, a) => n + (a.followers || 0), 0),
      posts: accounts.reduce((n, a) => n + (a.posts || 0), 0),
    }),
    [accounts],
  );

  function replace(account: Account) {
    setAccounts((prev) => prev.map((item) => (item.id === account.id ? account : item)));
  }

  async function add() {
    const value = handle.trim();
    if (!value) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: value, niche }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setError(t("Ce compte est déjà dans ton réseau.", "This account is already in your network.", en));
        return;
      }
      if (res.status === 402) {
        setError(t("Passe à un plan payant pour ajouter des comptes.", "Upgrade to a paid plan to add accounts.", en));
        return;
      }
      if (!res.ok || !json.account) throw new Error(json.error || "failed");
      setAccounts((prev) => [json.account, ...prev]);
      setHandle("");
      setNiche("");
    } catch {
      setError(t("Impossible d'ajouter ce compte.", "Could not add this account.", en));
    } finally {
      setAdding(false);
    }
  }

  async function sync(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/accounts/${id}/sync`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.account) replace(json.account);
    } finally {
      setBusy(null);
    }
  }

  async function patch(id: string, body: Partial<Pick<Account, "verdict" | "notes" | "niche" | "avgViews">>) {
    const res = await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.account) replace(json.account);
  }

  async function remove(id: string) {
    const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    if (res.ok) setAccounts((prev) => prev.filter((item) => item.id !== id));
  }

  return (
    <div className="ss-clippers">
      <div className="ss-panel">
        <h2>{t("Ton réseau de comptes", "Your accounts network", en)}</h2>
        <p className="ss-lead">
          {t(
            "Les comptes TikTok qui postent pour toi ou que tu veux reverse-engineer. Les abonnés, likes et nombre de posts viennent du profil public TikTok, sans clé API. Donne un verdict, note les formats qui marchent. Ils apparaissent dans l'éventail de l'Overview.",
            "The TikTok accounts posting for you or the ones you want to reverse-engineer. Followers, likes and post counts come from the public TikTok profile, no API key. Set a verdict, note the formats that work. They show up in the Overview fan.",
            en,
          )}
        </p>
        <div className="ss-clippers-add">
          <input
            className="ss-input"
            value={handle}
            placeholder={t("@handle ou lien tiktok.com/@…", "@handle or tiktok.com/@… link", en)}
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <input
            className="ss-input"
            value={niche}
            maxLength={60}
            placeholder={t("Niche (optionnel)", "Niche (optional)", en)}
            onChange={(e) => setNiche(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button type="button" className="ss-btn-purple" disabled={adding || !handle.trim()} onClick={add}>
            {adding ? t("Lecture du profil…", "Reading profile…", en) : t("Ajouter", "Add", en)}
          </button>
        </div>
        {error ? <p className="ss-lead ss-lead--err">{error}</p> : null}
        <div className="ss-stat-row ss-clippers-stats">
          <div className="ss-stat-card">
            <span>{t("Comptes", "Accounts", en)}</span>
            <b>{totals.count}</b>
          </div>
          <div className="ss-stat-card">
            <span>Keep</span>
            <b>{totals.keep}</b>
          </div>
          <div className="ss-stat-card">
            <span>{t("Abonnés cumulés", "Total followers", en)}</span>
            <b>{fmt(totals.followers, en)}</b>
          </div>
          <div className="ss-stat-card">
            <span>{t("Posts cumulés", "Total posts", en)}</span>
            <b>{fmt(totals.posts, en)}</b>
          </div>
        </div>
      </div>

      <div className="ss-panel">
        <div className="ss-clippers-head">
          <h2>{t("Comptes", "Accounts", en)}</h2>
          <div className="ss-warmed-filters">
            {(["all", "keep", "watch", "skip"] as const).map((f) => (
              <button key={f} type="button" className={`ss-pill ${filter === f ? "" : "is-mute"}`} onClick={() => setFilter(f)}>
                {f === "all" ? t("Tous", "All", en) : VERDICT[f].en}
              </button>
            ))}
          </div>
        </div>
        {loading ? <p className="ss-lead">{t("Chargement…", "Loading…", en)}</p> : null}
        {!loading && !filtered.length ? (
          <p className="ss-lead">{t("Aucun compte. Ajoute un @handle ci-dessus.", "No account yet. Add a @handle above.", en)}</p>
        ) : null}
        <div className="ss-clippers-list">
          {filtered.map((account) => {
            const v = VERDICT[account.verdict];
            const isEditing = editing === account.id;
            return (
              <article key={account.id} className="ss-clipper">
                <div className="ss-clipper__id">
                  {account.avatar ? <img src={account.avatar} alt="" /> : <span className="ss-clipper__avatar-fallback">@</span>}
                  <div>
                    <a href={`https://www.tiktok.com/@${account.handle}`} target="_blank" rel="noreferrer">
                      <b>@{account.handle}</b>
                    </a>
                    <span>
                      {account.nickname || ""}
                      {account.verified ? " ✓" : ""}
                      {account.niche ? ` · ${account.niche}` : ""}
                    </span>
                  </div>
                </div>
                <dl className="ss-clipper__stats">
                  <div>
                    <dt>{t("Abonnés", "Followers", en)}</dt>
                    <dd>{fmt(account.followers, en)}</dd>
                  </div>
                  <div>
                    <dt>Likes</dt>
                    <dd>{fmt(account.likes, en)}</dd>
                  </div>
                  <div>
                    <dt>Posts</dt>
                    <dd>{fmt(account.posts, en)}</dd>
                  </div>
                  <div>
                    <dt>{t("Vues moy.", "Avg views", en)}</dt>
                    <dd>
                      <input
                        className="ss-clipper__avg"
                        type="number"
                        min={0}
                        defaultValue={account.avgViews || 0}
                        onBlur={(e) => {
                          const value = Math.max(0, Number(e.target.value) || 0);
                          if (value !== account.avgViews) patch(account.id, { avgViews: value });
                        }}
                      />
                    </dd>
                  </div>
                </dl>
                <div className="ss-clipper__actions">
                  <select
                    className={`ss-badge ${v.cls} ss-clipper__verdict`}
                    value={account.verdict}
                    onChange={(e) => patch(account.id, { verdict: e.target.value as Verdict })}
                  >
                    <option value="keep">Keep</option>
                    <option value="watch">Watch</option>
                    <option value="skip">Skip</option>
                  </select>
                  <button type="button" className="ss-btn-ghost" disabled={busy === account.id} onClick={() => sync(account.id)}>
                    {busy === account.id ? t("Sync…", "Syncing…", en) : t("Actualiser", "Refresh", en)}
                  </button>
                  <button
                    type="button"
                    className="ss-btn-ghost"
                    onClick={() => {
                      setEditing(isEditing ? null : account.id);
                      setDraftNotes(account.notes || "");
                    }}
                  >
                    {t("Notes", "Notes", en)}
                  </button>
                  <button type="button" className="ss-btn-ghost ss-clipper__remove" onClick={() => remove(account.id)}>
                    ✕
                  </button>
                </div>
                <p className="ss-clipper__meta">
                  {t("Sync", "Sync", en)} {since(account.lastSyncAt, en)}
                  {account.syncError ? ` · ${syncErrorCopy(account.syncError, en)}` : ""}
                  {account.bio ? ` · ${account.bio.slice(0, 120)}` : ""}
                </p>
                {isEditing ? (
                  <div className="ss-clipper__notes">
                    <textarea
                      className="ss-input"
                      rows={3}
                      maxLength={800}
                      value={draftNotes}
                      placeholder={t("Formats qui marchent, CTA, rythme de post…", "Formats that work, CTA, posting rhythm…", en)}
                      onChange={(e) => setDraftNotes(e.target.value)}
                    />
                    <button
                      type="button"
                      className="ss-btn-purple"
                      onClick={async () => {
                        await patch(account.id, { notes: draftNotes });
                        setEditing(null);
                      }}
                    >
                      {t("Enregistrer", "Save", en)}
                    </button>
                  </div>
                ) : account.notes ? (
                  <p className="ss-clipper__note-text">{account.notes}</p>
                ) : null}
              </article>
            );
          })}
        </div>
        <p className="ss-lead">
          {t("Pour les stats détaillées de tes propres comptes connectés, va dans", "For detailed stats on your own connected accounts, go to", en)}{" "}
          <Link href="/app/analytics">Analytics</Link>.
        </p>
      </div>
    </div>
  );
}
