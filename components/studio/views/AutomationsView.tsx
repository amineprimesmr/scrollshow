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

  useEffect(() => {
    fetch("/api/studio/automations")
      .then((r) => r.json())
      .then((json) => setItems(json.automations || []))
      .finally(() => setLoading(false));
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

  const en = english;
  const used = items.filter((i) => i.status !== "draft").length;

  return (
    <div style={{ padding: "0 24px 48px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, color: "#71717a", fontWeight: 600 }}>
            ⚡ {used} / 1 {t("utilisée", "used", en)}
          </p>
          <h2 style={{ margin: "8px 0 4px", fontSize: 28, fontWeight: 800 }}>{t("Automations", "Automations", en)}</h2>
          <p style={{ margin: 0, color: "#52525b", fontSize: 14 }}>
            {t(
              "Génère du contenu en batch et planifie-le direct dans ton calendrier.",
              "Batch-generate content and schedule it straight into your calendar.",
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
            <Link
              key={item.id}
              href={`/app/automations/${item.id}/edit`}
              style={{ display: "flex", justifyContent: "space-between", padding: "16px 0", borderBottom: "1px solid #ececec", textDecoration: "none", color: "inherit" }}
            >
              <span>
                <strong>{item.name}</strong>
                <br />
                <small style={{ color: "#71717a" }}>{item.status} · {item.postsGenerated} posts</small>
              </span>
              <span>→</span>
            </Link>
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
              "Décris une campagne une fois — on génère une série de posts pour tes comptes TikTok et Instagram. Review, tweak, puis lance.",
              "Describe a campaign once and we'll generate a paced run of posts across your TikTok and Instagram accounts. Review, tweak, then launch.",
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
