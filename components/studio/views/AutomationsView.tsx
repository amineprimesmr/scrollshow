"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";
import { IconPlus } from "../icons";

type AutomationRow = {
  id: string;
  name: string;
  status: string;
  postsGenerated: number;
  createdAt: string;
};

export function AutomationsView() {
  const [english, setEnglish] = useState(false);
  const [items, setItems] = useState<AutomationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => setEnglish(prefersEnglish()), []);

  function load() {
    return fetch("/api/studio/automations")
      .then((r) => r.json())
      .then((json) => setItems(json.automations || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    void load();
  }, []);

  async function createNew() {
    const res = await fetch("/api/studio/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = await res.json();
    if (json.automation?.id) {
      window.location.href = `/app/automations/${json.automation.id}/edit`;
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(t(`Supprimer "${name}" ?`, `Delete "${name}"?`, en))) return;
    await fetch(`/api/studio/automations/${id}`, { method: "DELETE" });
    void load();
  }

  const en = english;

  return (
    <div style={{ padding: "0 24px 48px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h2 style={{ margin: "8px 0 4px", fontSize: 28, fontWeight: 800 }}>{t("Automations", "Automations", en)}</h2>
          <p style={{ margin: 0, color: "#52525b", fontSize: 14 }}>
            {t(
              "Planifie automatiquement tes brouillons sur TikTok, à un rythme régulier.",
              "Automatically schedule your drafts to TikTok, on a regular cadence.",
              en,
            )}
          </p>
        </div>
        <button type="button" className="ss-btn-purple" onClick={() => void createNew()}>
          <IconPlus size={16} />
          {t("Nouvelle automation", "New automation", en)}
        </button>
      </div>

      {loading ? (
        <p className="ss-lead">{t("Chargement…", "Loading…", en)}</p>
      ) : items.length ? (
        <div className="ss-panel">
          {items.map((item) => (
            <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: "1px solid #ececec" }}>
              <Link href={`/app/automations/${item.id}/edit`} style={{ textDecoration: "none", color: "inherit", flex: 1 }}>
                <strong>{item.name}</strong>
                <br />
                <small style={{ color: "#71717a" }}>{item.status} · {item.postsGenerated} posts</small>
              </Link>
              <button type="button" className="ss-btn-ghost" onClick={() => void remove(item.id, item.name)}>
                {t("Supprimer", "Delete", en)}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="ss-panel" style={{ textAlign: "center", padding: "64px 32px" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#f4f4f5", display: "grid", placeItems: "center", margin: "0 auto 16px", fontSize: 28 }}>
            📅
          </div>
          <h3 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800 }}>
            {t("Lance ta première automation", "Launch your first automation", en)}
          </h3>
          <p style={{ margin: "0 0 24px", color: "#52525b", maxWidth: 420, marginInline: "auto", lineHeight: 1.5 }}>
            {t(
              "Choisis un rythme une fois — on planifie tes brouillons existants sur TikTok à intervalle régulier.",
              "Set a cadence once — we'll schedule your existing drafts to TikTok at a regular interval.",
              en,
            )}
          </p>
          <button type="button" className="ss-btn-purple" onClick={() => void createNew()}>
            <IconPlus size={16} />
            {t("Nouvelle automation", "New automation", en)}
          </button>
        </div>
      )}
    </div>
  );
}
