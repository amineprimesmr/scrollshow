"use client";

import { Atmosphere } from "@/components/Atmosphere";
import { AuthNav } from "@/components/AuthNav";
import { AssistantStarter } from "@/components/AssistantStarter";
import { OnboardingPayment } from "@/components/OnboardingPayment";
import { hasStudioAccess } from "@/lib/plans";
import { LiquidGlassDefs } from "@/components/LiquidGlassDefs";
import { AI_CLIENTS, type AiClientId } from "@/lib/ai-clients";
import { BUSINESS_KINDS } from "@/lib/business-kinds";
import { prefersEnglish } from "@/lib/i18n";
import { safeNextPath } from "@/lib/auth-urls";
import type { BusinessKind, BusinessProfile, PublicUser } from "@/lib/types";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../liquid-glass.css";
import "./onboarding.css";
import "@/components/atmosphere.css";

type Step = 0 | 1 | 2 | 3 | 4;
const STEPS: Step[] = [0, 1, 2, 3, 4];

const SOURCES = [
  { id: "tiktok", fr: "TikTok", en: "TikTok", logo: "/assets/platforms/tiktok.png" },
  { id: "youtube", fr: "YouTube", en: "YouTube", logo: "/assets/platforms/youtube.svg" },
  { id: "instagram", fr: "Instagram", en: "Instagram", logo: "/assets/platforms/instagram.png" },
  { id: "x", fr: "X (Twitter)", en: "X (Twitter)", logo: "/assets/platforms/x.png", invert: true },
  { id: "google", fr: "Google", en: "Google", logo: "/assets/platforms/google.svg" },
  { id: "friend", fr: "Un ami / un client", en: "A friend / a client", emoji: "🤝" },
  { id: "clipper", fr: "Un clipper", en: "A clipper", emoji: "✂️" },
  { id: "other", fr: "Autre", en: "Other", emoji: "✨" },
] as const;

const KIND_ICON: Record<BusinessKind, string> = {
  saas: "🧩",
  ecommerce: "🛒",
  mobile_app: "📱",
  creator: "🎥",
  agency: "🏢",
  service: "🤝",
  media: "📰",
  other: "✨",
};

const GENERIC_MAILBOX = new Set([
  "contact", "hello", "info", "bonjour", "team", "admin", "sales", "support",
  "service", "commercial", "noreply", "no-reply", "mail", "email", "office", "help",
]);

function firstNameFromEmail(email: string) {
  const local = (email.split("@")[0] || "").toLowerCase();
  const first = local.split(/[._+\-0-9]+/).filter(Boolean)[0] || "";
  if (first.length < 2 || GENERIC_MAILBOX.has(first)) return "";
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** Un prenom deja stocke qui n'est que le nom de boite generique ne vaut rien. */
function usableName(stored: string) {
  return GENERIC_MAILBOX.has(stored.trim().toLowerCase()) ? "" : stored.trim();
}

function fmt(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

/** Counts up from 0 to `value` once, spring-ish, for the reveal card. */
function useCountUp(value: number, active: boolean) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const start = performance.now();
    const duration = 1100;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(value * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, active]);
  return shown;
}

function Stat({ label, value, active }: { label: string; value: number; active: boolean }) {
  const shown = useCountUp(value, active);
  return (
    <div className="ss-onb-stat">
      <b>{fmt(shown)}</b>
      <span>{label}</span>
    </div>
  );
}

function OnboardingInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"), "/app");
  const [english, setEnglish] = useState(false);
  const t = useCallback((fr: string, en: string) => (english ? en : fr), [english]);

  const [step, setStep] = useState<Step>(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Step 0
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [logo, setLogo] = useState<string>("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Step 1
  const [url, setUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [stage, setStage] = useState(0);
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [manual, setManual] = useState(false);
  const [tiktokInput, setTiktokInput] = useState("");
  const [tiktokBusy, setTiktokBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // Step 2
  const [client, setClient] = useState<AiClientId>("claude");
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState("");

  // Step 3
  const [heard, setHeard] = useState<string[]>([]);

  useEffect(() => {
    setEnglish(prefersEnglish());
    fetch("/api/onboarding")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((json) => {
        const me: PublicUser = json.user;
        setUser(me);
        setHeard(json.heardFrom || []);
        if (me.onboarded && !hasStudioAccess(me.plan)) setStep(4);
        else if (me.onboarded && hasStudioAccess(me.plan) && !params.get("next")) { router.replace("/app"); return; }
        else {
          if (Number.isInteger(json.step) && json.step >= 0 && json.step <= 3) setStep(json.step as Step);
        }
        setName(usableName(me.name || "") || firstNameFromEmail(me.email));
        setCompany(json.company || "");
        setLogo(json.logo || "");
        if (me.business?.url) {
          setBusiness(me.business);
          setUrl(me.business.url);
          setRevealed(true);
        }
      })
      .catch(() => router.replace("/signup?mode=signin&next=/onboarding"));
  }, [router, params]);

  function go(target: Step) {
    setDir(target > step ? 1 : -1);
    setError("");
    setStep(target);
    if (user && target < 4) void post({ action: "progress", step: target }).catch(() => {});
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "server");
    return json;
  }

  /* ── step 0 ─────────────────────────────────────────────────────────── */
  function onLogoFile(file: File | undefined) {
    if (!file || !/^image\/(png|jpe?g|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  async function saveProfile() {
    if (!name.trim() || !company.trim()) return;
    setBusy(true);
    try {
      const json = await post({ action: "profile", name, company, logo: logo.startsWith("data:") ? logo : null });
      setUser(json.user);
      if (json.user?.business?.logo) setLogo(json.user.business.logo);
      go(2);
    } catch {
      setError(t("Impossible d’enregistrer. Réessaie.", "Could not save. Try again."));
    } finally {
      setBusy(false);
    }
  }

  /* ── step 1 ─────────────────────────────────────────────────────────── */
  const stages = useMemo(
    () => [
      t("Connexion au site", "Reaching the site"),
      t("Lecture de la page", "Reading the page"),
      t("Détection du modèle", "Detecting the business model"),
      t("Recherche des réseaux", "Finding social accounts"),
      t("Analyse TikTok", "Analyzing TikTok"),
    ],
    [t],
  );

  async function analyze() {
    if (!url.trim()) return;
    setAnalyzing(true);
    setRevealed(false);
    setError("");
    setStage(0);
    const timer = window.setInterval(() => setStage((s) => Math.min(s + 1, stages.length - 1)), 700);
    try {
      // Fast sites answer in 300ms; the scan still plays long enough to be read.
      const [json] = await Promise.all([post({ action: "analyze", url }), new Promise((r) => window.setTimeout(r, 3200))]);
      const found: BusinessProfile = json.business;
      const merged: BusinessProfile = { ...found, name: found.name || company, logo: logo || found.logo };
      // Ce que l'analyse trouve alimente l'etape suivante plutot que d'etre ressaisi.
      if (!company.trim() && merged.name) setCompany(merged.name);
      if (!logo && merged.logo) setLogo(merged.logo);
      setStage(stages.length);
      setBusiness(merged);
      setManual(false);
      window.setTimeout(() => setRevealed(true), 250);
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      setError(
        code === "invalid_url"
          ? t("Ce lien ne ressemble pas à une adresse valide.", "That does not look like a valid link.")
          : code === "blocked"
            ? t("Le site bloque la lecture automatique. Décris ton business à la main.", "The site blocks automated reading. Describe your business manually.")
            : t("Site injoignable. Vérifie le lien ou décris ton business à la main.", "Site unreachable. Check the link or describe your business manually."),
      );
    } finally {
      window.clearInterval(timer);
      setAnalyzing(false);
    }
  }

  function startManual() {
    setManual(true);
    if (!company.trim() && url.trim()) {
      // « boutique-machin.fr » donne « Boutique Machin » : mieux que rien a corriger.
      const host = url.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || "";
      const guess = host.split(".")[0].replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      if (guess) setCompany(guess.slice(0, 60));
    }
    setBusiness({
      name: company,
      url: url.trim(),
      kind: "other",
      logo,
      tagline: "",
      keywords: [],
      socials: [],
      signals: ["manual"],
      tiktok: null,
      analyzedAt: new Date().toISOString(),
    });
    setRevealed(true);
  }

  async function addTikTok() {
    if (!business || !tiktokInput.trim()) return;
    setTiktokBusy(true);
    try {
      const json = await post({ action: "tiktok", handle: tiktokInput });
      if (!json.tiktok) {
        setError(t("Compte TikTok introuvable.", "TikTok account not found."));
        return;
      }
      const handle = json.tiktok.handle as string;
      setBusiness({
        ...business,
        tiktok: json.tiktok,
        socials: [
          ...business.socials.filter((item) => item.platform !== "tiktok"),
          { platform: "tiktok", url: `https://www.tiktok.com/@${handle}`, handle },
        ],
      });
      setTiktokInput("");
      setError("");
    } finally {
      setTiktokBusy(false);
    }
  }

  async function saveBusiness() {
    if (!business) return;
    setBusy(true);
    try {
      const json = await post({ action: "business", business: { ...business, name: business.name || company } });
      setUser(json.user);
      // Le profil reprend ce que l'analyse a trouve : plus rien a retaper.
      if (!company.trim() && business.name) setCompany(business.name);
      if (!logo && business.logo) setLogo(business.logo);
      go(1);
    } catch {
      setError(t("Impossible d’enregistrer. Réessaie.", "Could not save. Try again."));
    } finally {
      setBusy(false);
    }
  }

  /* ── step 2 · AI ─────────────────────────────────────────────────────── */
  async function prepareConnector() {
    setBusy(true); setError("");
    try { const json = await post({ action: "key" }); setToken(json.token || ""); }
    catch { setError(t("Impossible de préparer la connexion. Réessaie ou configure-la plus tard dans le studio.", "Could not prepare the connection. Retry or configure it later in the studio.")); }
    finally { setBusy(false); }
  }

  const origin = typeof window === "undefined" ? "https://scrollshow.io" : window.location.origin;
  const mcpUrl = `${origin}/api/mcp`;
  const liveToken = token || "";
  /** One address carries the key: nothing else to paste anywhere. */
  const keyedUrl = liveToken ? `${mcpUrl}?key=${liveToken}` : "";
  const connectorUrl = "https://claude.ai/customize/connectors?modal=add-custom-connector";
  const codexCli = keyedUrl ? `codex mcp add scrollshow --url "${keyedUrl}"` : "";
  const cursorDeeplink = useMemo(() => {
    if (!keyedUrl) return "#";
    const config = btoa(JSON.stringify({ url: keyedUrl })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return `cursor://anysphere.cursor-deeplink/mcp/install?name=scrollshow&config=${config}`;
  }, [keyedUrl]);
  const clients = AI_CLIENTS.filter((item) => item.id !== "claude-code");

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied((cur) => (cur === id ? "" : cur)), 1600);
    } catch { setError(t("Copie impossible. Réessaie depuis un navigateur autorisant le presse-papiers.", "Copy failed. Retry in a browser that allows clipboard access.")); }
  }

  /* ── step 3 · heard from ─────────────────────────────────────────────── */
  async function finish() {
    setBusy(true);
    try {
      const json = await post({ action: "finish", heardFrom: heard });
      setUser(json.user);
      if (hasStudioAccess(json.user?.plan)) router.replace(next);
      else { go(4); setBusy(false); }
    } catch {
      setError(t("Impossible de terminer. Réessaie.", "Could not finish. Try again."));
      setBusy(false);
    }
  }

  /* ── render ─────────────────────────────────────────────────────────── */
  const titles: Record<Step, [string, string]> = {
    0: [t("Bienvenue sur ScrollShow", "Welcome to ScrollShow"), t("Colle le lien de ton business. On remplit le reste pour toi.", "Paste your business link. We fill in the rest for you.")],
    1: [t("On a rempli ce qu’on a trouvé", "We filled in what we found"), t("Vérifie, corrige si besoin. C’est tout ce qu’on te demande.", "Check it, fix anything that is off. That is all we ask.")],
    2: [t("Branche ton IA", "Plug in your AI"), t("Claude, Cursor ou Codex créent et planifient tes carrousels directement depuis la conversation.", "Claude, Cursor or Codex create and schedule your carousels straight from the chat.")],
    3: [t("Dernière question", "One last thing"), t("Comment as-tu connu ScrollShow ?", "How did you hear about ScrollShow?")],
    4: [t("Active ton espace", "Activate your workspace"), t("Dernière étape : ton accès à ScrollShow.", "Last step: your access to ScrollShow.")],
  };

  const stepClass = `ss-onb-step ${dir === 1 ? "from-right" : "from-left"}`;

  return (
    <main className="ss-onb">
      <LiquidGlassDefs />
      <Atmosphere />
      <AuthNav current={step >= 4 ? "access" : "workspace"} end={user ? user.email : null} />

      <section className="ss-onb__stage" key={step}>
        <h1 className={`ss-onb__title ${stepClass}`}>{titles[step][0]}</h1>
        <p className={`ss-onb__sub ${stepClass}`}>{titles[step][1]}</p>

        <div className={`ss-onb__card ${stepClass}`}>
          {/* ── 0 · lien du business + analyse ── */}
          {step === 0 ? (
            <div className="ss-onb-form">
              {!analyzing && !revealed ? (
                <>
                  <label className="ss-onb-field">
                    <div className="ss-onb-url">
                      <input
                        aria-label={t("Lien de ton business", "Your business link")}
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder={t("Lien de ton business", "Your business link")}
                        inputMode="url"
                        autoFocus
                        onKeyDown={(e) => (e.key === "Enter" ? void analyze() : null)}
                      />
                      <button type="button" className="ss-onb-cta ss-onb-cta--inline" disabled={!url.trim()} onClick={() => void analyze()}>
                        {t("Analyser", "Analyze")}
                      </button>
                    </div>
                  </label>
                  <ul className="ss-onb-hints">
                    <li><img src="/assets/platforms/website.svg" alt="" width="18" height="18" />SaaS</li>
                    <li><img src="/assets/platforms/shopify.svg" alt="" width="18" height="18" />{t("E-commerce", "E-commerce")}</li>
                    <li><img src="/assets/platforms/app-store.svg" alt="" width="18" height="18" />{t("App mobile", "Mobile app")}</li>
                  </ul>
                  {error ? <p className="ss-onb-error">{error}</p> : null}
                  <button type="button" className="ss-onb-link ss-onb-link--center" onClick={startManual}>
                    {t("Je n’ai pas de lien, je décris mon business", "I have no link, I’ll describe my business")}
                  </button>
                </>
              ) : null}

              {analyzing ? (
                <div className="ss-onb-scan" aria-live="polite">
                  <div className="ss-onb-scan__orb">
                    <span />
                    <span />
                    <span />
                  </div>
                  <ol className="ss-onb-scan__list">
                    {stages.map((label, index) => (
                      <li key={label} className={index < stage ? "is-done" : index === stage ? "is-now" : ""}>
                        <i />
                        {label}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}

              {revealed && business ? (
                <div className={`ss-onb-result ${revealed ? "is-in" : ""}`}>
                  <div className="ss-onb-result__head">
                    <div className="ss-onb-result__logo" style={business.brandColor ? { boxShadow: `0 0 0 2px ${business.brandColor}` } : undefined}>
                      {business.logo ? <img src={business.logo} alt="" onError={(e) => ((e.currentTarget.style.display = "none"))} /> : <span>{KIND_ICON[business.kind]}</span>}
                    </div>
                    <div className="ss-onb-result__id">
                      <input
                        className="ss-onb-result__name"
                        value={business.name}
                        onChange={(e) => setBusiness({ ...business, name: e.target.value })}
                        maxLength={60}
                        aria-label={t("Nom", "Name")}
                      />
                      {business.url ? <a href={business.url} target="_blank" rel="noreferrer">{business.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a> : null}
                    </div>
                    <button type="button" className="ss-onb-link" onClick={() => { setRevealed(false); setBusiness(null); setManual(false); }}>
                      {t("Changer", "Change")}
                    </button>
                  </div>

                  <textarea
                    className="ss-onb-result__tagline"
                    value={business.tagline || ""}
                    onChange={(e) => setBusiness({ ...business, tagline: e.target.value })}
                    placeholder={manual ? t("Décris ton business en une phrase : ce que tu vends, à qui.", "Describe your business in one line: what you sell, to whom.") : t("Description", "Description")}
                    rows={2}
                    maxLength={200}
                  />

                  <div className="ss-onb-kinds" role="radiogroup" aria-label={t("Type de business", "Business type")}>
                    {BUSINESS_KINDS.map((kind) => (
                      <button
                        key={kind.id}
                        type="button"
                        role="radio"
                        aria-checked={business.kind === kind.id}
                        className={`ss-onb-chip ${business.kind === kind.id ? "is-on" : ""}`}
                        onClick={() => setBusiness({ ...business, kind: kind.id })}
                      >
                        <span>{KIND_ICON[kind.id]}</span>
                        {english ? kind.en : kind.fr}
                      </button>
                    ))}
                  </div>

                  {business.tiktok ? (
                    <div className="ss-onb-tt">
                      <div className="ss-onb-tt__who">
                        {business.tiktok.avatar ? <img src={business.tiktok.avatar} alt="" /> : null}
                        <div>
                          <b>{business.tiktok.nickname || `@${business.tiktok.handle}`}</b>
                          <span>@{business.tiktok.handle}</span>
                        </div>
                      </div>
                      <div className="ss-onb-stats">
                        <Stat label={t("abonnés", "followers")} value={business.tiktok.followers} active={revealed} />
                        <Stat label={t("likes", "likes")} value={business.tiktok.likes} active={revealed} />
                        <Stat label={t("posts", "posts")} value={business.tiktok.videos} active={revealed} />
                        {business.tiktok.avgViews ? <Stat label={t("vues / post", "views / post")} value={business.tiktok.avgViews} active={revealed} /> : null}
                      </div>
                      {business.tiktok.source === "api" ? (
                        <p className="ss-onb-tt__note">
                          {business.tiktok.photoShare >= 50
                            ? t(`${business.tiktok.photoShare} % de tes derniers posts sont déjà des carrousels. On va les faire décoller.`, `${business.tiktok.photoShare}% of your recent posts are already carousels. We will make them fly.`)
                            : t(`Seulement ${business.tiktok.photoShare} % de carrousels dans tes derniers posts. C’est là que ScrollShow change tout.`, `Only ${business.tiktok.photoShare}% carousels in your recent posts. That is where ScrollShow changes everything.`)}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="ss-onb-tt ss-onb-tt--empty">
                      <span>{t("Tu as déjà un compte TikTok pour cette marque ?", "Already have a TikTok account for this brand?")}</span>
                      <div className="ss-onb-url">
                        <input value={tiktokInput} onChange={(e) => setTiktokInput(e.target.value)} placeholder="@handle" onKeyDown={(e) => (e.key === "Enter" ? void addTikTok() : null)} />
                        <button type="button" className="ss-onb-cta ss-onb-cta--inline ss-onb-cta--ghost" disabled={tiktokBusy || !tiktokInput.trim()} onClick={() => void addTikTok()}>
                          {tiktokBusy ? <span className="ss-onb-spin" /> : t("Ajouter", "Add")}
                        </button>
                      </div>
                    </div>
                  )}

                  {business.socials.filter((s) => s.platform !== "tiktok").length ? (
                    <div className="ss-onb-socials">
                      {business.socials
                        .filter((s) => s.platform !== "tiktok")
                        .map((s) => (
                          <span key={s.platform}>
                            {s.platform} · @{s.handle}
                          </span>
                        ))}
                    </div>
                  ) : null}

                  {error ? <p className="ss-onb-error">{error}</p> : null}
                  <button type="button" className="ss-onb-cta" disabled={busy || !business.name.trim() || (manual && !(business.tagline || "").trim())} onClick={() => void saveBusiness()}>
                    {busy ? <span className="ss-onb-spin" /> : t("C’est bien ça, continuer", "That’s right, continue")}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ── 1 · profil, pre-rempli par l'analyse ── */}
          {step === 1 ? (
            <form
              className="ss-onb-form"
              onSubmit={(event) => {
                event.preventDefault();
                void saveProfile();
              }}
            >
              <div className="ss-onb-row">
                <label className="ss-onb-field">
                  <span>{t("Ton prénom", "Your first name")}</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Amine" maxLength={40} autoFocus required />
                </label>
                <label className="ss-onb-field">
                  <span>{t("Ton entreprise ou ta marque", "Your company or brand")}</span>
                  <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="ScrollShow" maxLength={60} required />
                </label>
              </div>
              <div
                className={`ss-onb-drop ${logo ? "has-logo" : ""}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  onLogoFile(e.dataTransfer.files?.[0]);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? fileRef.current?.click() : null)}
              >
                {logo ? <img src={logo} alt="" /> : <span className="ss-onb-drop__icon">＋</span>}
                <div>
                  <b>{logo ? t("Logo ajouté", "Logo added") : t("Logo (optionnel)", "Logo (optional)")}</b>
                  <span>{t("PNG, JPG ou WebP · 5 Mo max", "PNG, JPG or WebP · 5 MB max")}</span>
                </div>
                {logo ? (
                  <button
                    type="button"
                    className="ss-onb-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLogo("");
                    }}
                  >
                    {t("Retirer", "Remove")}
                  </button>
                ) : null}
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => onLogoFile(e.target.files?.[0])} />
              </div>
              {error ? <p className="ss-onb-error">{error}</p> : null}
              <button className="ss-onb-cta" type="submit" disabled={busy || !name.trim() || !company.trim()}>
                {busy ? <span className="ss-onb-spin" /> : t("Continuer", "Continue")}
              </button>
            </form>
          ) : null}

          {/* ── 2 · connect Claude ── */}
          {step === 2 ? (
            <div className="ss-onb-form">
              <p className="ss-onb-help">{t("Cette étape est facultative. L’utilisation des outils sera activée après paiement. Si tu as déjà branché ton assistant, continue sans recréer de clé.", "This step is optional. Tools become available after payment. If your assistant is already connected, continue without replacing its key.")}</p>
              <h3>{t("1 · Connecter ScrollShow", "1 · Connect ScrollShow")}</h3>
              {!token && <button type="button" className="ss-onb-cta" disabled={busy} onClick={() => void prepareConnector()}>{busy ? "…" : t("Préparer ou remplacer ma connexion", "Prepare or replace my connection")}</button>}
              {error && <p role="alert" className="ss-onb-error">{error}</p>}
              <div className="ss-onb-clients" role="tablist">
                {clients.map((item) => (
                  <button key={item.id} type="button" role="tab" aria-selected={client === item.id} className={`ss-onb-client ${client === item.id ? "is-on" : ""}`} onClick={() => setClient(item.id)}>
                    <span style={{ background: item.bg }}>
                      <img src={item.logo} alt="" />
                    </span>
                    {item.label}
                  </button>
                ))}
              </div>

              {token && client === "cursor" ? (
                <>
                  <a className={`ss-onb-cta ${keyedUrl ? "" : "is-disabled"}`} href={cursorDeeplink}>
                    {keyedUrl ? t("Installer dans Cursor", "Install in Cursor") : t("Préparation…", "Preparing…")}
                  </a>
                  <p className="ss-onb-help">{t("Un clic. Cursor s’ouvre et te demande de confirmer.", "One click. Cursor opens and asks you to confirm.")}</p>
                </>
              ) : null}

              {token && client === "codex" ? (
                <>
                  <div className="ss-onb-code">
                    <pre>{codexCli ? codexCli.replace(/key=[^\"]+/, "key=…") : t("Préparation…", "Preparing…")}</pre>
                    <button type="button" className="ss-onb-copy" disabled={!codexCli} onClick={() => void copy("cmd", codexCli)}>
                      {copied === "cmd" ? t("Copié ✓", "Copied ✓") : t("Copier", "Copy")}
                    </button>
                  </div>
                  <p className="ss-onb-help">{t("Une commande dans ton terminal, c’est branché.", "One command in your terminal, done.")}</p>
                </>
              ) : null}

              {token && client === "claude" ? (
                <>
                  <div className="ss-onb-code ss-onb-code--field">
                    <pre>{keyedUrl ? keyedUrl.replace(/key=.*$/, "key=…") : t("Préparation…", "Preparing…")}</pre>
                    <button type="button" className="ss-onb-copy" disabled={!keyedUrl} onClick={() => void copy("url", keyedUrl)}>
                      {copied === "url" ? t("Copié ✓", "Copied ✓") : t("Copier", "Copy")}
                    </button>
                  </div>
                  <p className="ss-onb-help">
                    {t(
                      "Cette adresse contient une clé privée : colle-la uniquement dans l’URL du connecteur Claude, jamais dans une conversation. Nomme le connecteur ScrollShow et active-le. Utilise ensuite le prompt ci-dessous.",
                      "This address contains a private key: paste it only into Claude’s connector URL, never into a conversation. Name the connector ScrollShow and enable it. Then use the prompt below.",
                    )}
                  </p>
                  <a className="ss-onb-cta ss-onb-cta--claude" href={connectorUrl} target="_blank" rel="noreferrer">
                    <img src="/assets/ai/claude.png?v=2" alt="" />
                    {t("Configurer le connecteur Claude", "Configure the Claude connector")}
                  </a>
                </>
              ) : null}

              <AssistantStarter english={english} pending />
              <button type="button" className="ss-onb-cta" onClick={() => go(3)}>
                {t("Continuer l’onboarding", "Continue onboarding")}
              </button>
              <div className="ss-onb-actions">
                <button type="button" className="ss-onb-link" onClick={() => go(1)}>
                  ← {t("Retour", "Back")}
                </button>
                <button type="button" className="ss-onb-link" onClick={() => go(3)}>
                  {t("Plus tard, depuis le studio", "Later, from the studio")}
                </button>
              </div>
            </div>
          ) : null}

          {/* ── 3 · heard from ── */}
          {step === 3 ? (
            <div className="ss-onb-form">
              <div className="ss-onb-grid ss-onb-grid--4">
                {SOURCES.map((item) => {
                  const on = heard.includes(item.id);
                  return (
                    <button key={item.id} type="button" aria-pressed={on} className={`ss-onb-chip ss-onb-chip--logo ${on ? "is-on" : ""}`} onClick={() => setHeard(on ? heard.filter((h) => h !== item.id) : [...heard, item.id])}>
                      {"logo" in item ? <img src={item.logo} alt="" className={"invert" in item && item.invert ? "is-invert" : ""} /> : <span>{item.emoji}</span>}
                      {english ? item.en : item.fr}
                    </button>
                  );
                })}
              </div>
              {error ? <p className="ss-onb-error">{error}</p> : null}
              <button type="button" className="ss-onb-cta" disabled={busy} onClick={() => void finish()}>
                {busy ? <span className="ss-onb-spin" /> : hasStudioAccess(user?.plan) ? t("Ouvrir ScrollShow", "Open ScrollShow") : t("Continuer vers mon offre", "Continue to my plan")}
              </button>
              <button type="button" className="ss-onb-link ss-onb-link--center" onClick={() => go(2)}>
                ← {t("Retour", "Back")}
              </button>
            </div>
          ) : null}
          {step === 4 && user?.onboarded ? <OnboardingPayment english={english} initialOffer={params.get("offer") === "lifetime" ? "lifetime" : "monthly"} canceled={params.get("canceled") === "1"} pendingPayment={params.get("error") === "payment_pending"} /> : null}
        </div>

        <ol className="ss-onb__dots" aria-label={t("Progression", "Progress")}>
          {STEPS.map((item) => (
            <li key={item} className={item === step ? "is-now" : item < step ? "is-done" : ""} />
          ))}
        </ol>
      </section>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingInner />
    </Suspense>
  );
}
