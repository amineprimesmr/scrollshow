"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useStudio } from "../StudioContext";

export function BrandView() {
  const [english, setEnglish] = useState(false);
  const [website, setWebsite] = useState("");
  const [productName, setProductName] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => setEnglish(prefersEnglish()), []);
  const en = english;

  useEffect(() => {
    fetch("/api/studio/brand")
      .then((res) => res.json())
      .then((json) => {
        const brand = json.brand;
        if (brand) {
          setWebsite(brand.website || "");
          setProductName(brand.productName || "");
          setAudience(brand.audience || "");
          setTone(brand.tone || "");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/studio/brand", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ website, productName, audience, tone }),
    });
    setSaving(false);
    if (res.ok) setSaved(true);
  }

  return (
    <div style={{ padding: 24, maxWidth: 560 }}>
      <div className="ss-panel">
        <h3>{t("Contexte marque", "Brand context", en)}</h3>
        <p className="ss-lead">{t("Contexte marque — utile pour te rappeler ton positionnement.", "Brand context — a place to keep your positioning on hand.", en)}</p>
        {loading ? (
          <p className="ss-lead">{t("Chargement…", "Loading…", en)}</p>
        ) : (
          <>
            <label style={{ display: "block", marginTop: 16 }}>
              {t("Site web", "Website", en)}
              <input className="ss-input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" style={{ width: "100%", marginTop: 6 }} />
            </label>
            <label style={{ display: "block", marginTop: 16 }}>
              {t("Produit", "Product", en)}
              <input className="ss-input" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder={t("Nom du produit", "Product name", en)} style={{ width: "100%", marginTop: 6 }} />
            </label>
            <label style={{ display: "block", marginTop: 16 }}>
              {t("Audience", "Audience", en)}
              <textarea className="ss-input" rows={2} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder={t("Qui achète ton produit ?", "Who buys your product?", en)} style={{ width: "100%", marginTop: 6 }} />
            </label>
            <label style={{ display: "block", marginTop: 16 }}>
              {t("Ton", "Tone", en)}
              <input className="ss-input" value={tone} onChange={(e) => setTone(e.target.value)} placeholder={t("Ex. direct, fun, premium", "e.g. direct, fun, premium", en)} style={{ width: "100%", marginTop: 6 }} />
            </label>
            <button type="button" className="ss-btn-purple" style={{ marginTop: 16 }} disabled={saving} onClick={() => void save()}>
              {saving ? t("Enregistrement…", "Saving…", en) : saved ? t("Enregistré ✓", "Saved ✓", en) : t("Enregistrer", "Save", en)}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function GuideView() {
  const [english, setEnglish] = useState(false);
  useEffect(() => setEnglish(prefersEnglish()), []);
  const en = english;
  return (
    <div className="ss-home" style={{ paddingTop: 24 }}>
      <section className="ss-faq">
        <h2>❓ {t("Guide & FAQ", "Guide & FAQ", en)}</h2>
        <p className="ss-lead">{t("Tout ce qu'il faut savoir pour lancer ScrollShow.", "Everything you need to know to run ScrollShow.", en)}</p>
      </section>
    </div>
  );
}

export function WarmedAccountsView() {
  const [english, setEnglish] = useState(false);
  useEffect(() => setEnglish(prefersEnglish()), []);
  const en = english;
  return (
    <div className="ss-empty" style={{ margin: 24 }}>
      <h2>{t("Comptes warmés", "Warmed Accounts", en)}</h2>
      <p>{t("Comptes TikTok/IG US/EU warmés sur vrais téléphones — à partir de 80€/mois.", "Real US/EU TikTok/IG accounts warmed on real phones — from $80/month.", en)}</p>
      <Link href="/app/billing" className="ss-btn-purple">{t("Upgrade", "Upgrade", en)}</Link>
    </div>
  );
}

export function AffiliateView() {
  const [english, setEnglish] = useState(false);
  useEffect(() => setEnglish(prefersEnglish()), []);
  const en = english;
  return (
    <div className="ss-empty" style={{ margin: 24 }}>
      <h2>{t("Parrainer & gagner", "Refer & Earn", en)}</h2>
      <p>{t("Programme de parrainage — bientôt disponible.", "Referral program — coming soon.", en)}</p>
    </div>
  );
}
