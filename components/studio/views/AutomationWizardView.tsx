"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const STEPS = ["Basics", "Caption style", "Angles", "Voice", "Schedule", "Accounts", "Review", "Generate", "Preview", "Launch"];

const MIX_COLORS = ["#fbbf24", "#60a5fa", "#34d399", "#f97316"];
const MIX_LABELS = ["Slideshow", "Wall of text", "Green screen", "Video hook"];

type Props = { automationId: string };

export function AutomationWizardView({ automationId }: Props) {
  const router = useRouter();
  const [english, setEnglish] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [mix, setMix] = useState([25, 25, 25, 25]);
  const [remixRatio, setRemixRatio] = useState(50);
  const [mention, setMention] = useState("sometimes");
  const [angles, setAngles] = useState([
    { id: "1", label: "Carousel Format Research", weight: 34 },
    { id: "2", label: "Content Reference Chaos", weight: 33 },
    { id: "3", label: "Faster TikTok Publishing", weight: 33 },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => setEnglish(prefersEnglish()), []);

  useEffect(() => {
    fetch(`/api/studio/automations/${automationId}`)
      .then((r) => r.json())
      .then((json) => {
        const a = json.automation;
        if (!a) return;
        setStep(Math.max(0, (a.step || 1) - 1));
        setName(a.name || "");
        if (a.config?.contentMix) {
          const c = a.config.contentMix;
          setMix([c.slideshow, c.wallOfText, c.greenScreen, c.videoHook]);
        }
        if (a.config?.remixRatio != null) setRemixRatio(a.config.remixRatio);
        if (a.config?.mentionBusiness) setMention(a.config.mentionBusiness);
        if (a.config?.angles?.length) setAngles(a.config.angles);
      });
  }, [automationId]);

  async function save(nextStep: number) {
    setSaving(true);
    await fetch(`/api/studio/automations/${automationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step: nextStep + 1,
        name: name || undefined,
        config: {
          contentMix: { slideshow: mix[0], wallOfText: mix[1], greenScreen: mix[2], videoHook: mix[3] },
          remixRatio,
          mentionBusiness: mention,
          angles,
        },
      }),
    });
    setSaving(false);
  }

  async function goNext() {
    const next = Math.min(step + 1, STEPS.length - 1);
    await save(next);
    if (next === STEPS.length - 1) {
      await fetch(`/api/studio/automations/${automationId}/launch`, { method: "POST" });
      router.push("/app/automations");
      return;
    }
    setStep(next);
  }

  function adjustMix(index: number, delta: number) {
    setMix((prev) => {
      const next = [...prev];
      next[index] = Math.max(0, Math.min(100, next[index] + delta));
      const total = next.reduce((a, b) => a + b, 0);
      if (total !== 100) next[(index + 1) % 4] = Math.max(0, next[(index + 1) % 4] + (100 - total));
      return next;
    });
  }

  const en = english;
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="ss-wizard">
      <Link href="/app/automations" style={{ fontSize: 13, color: "#71717a", textDecoration: "none", display: "inline-block", marginBottom: 16 }}>
        ← {t("Automations", "Automations", en)}
      </Link>
      <div className="ss-wizard-card">
        <div className="ss-wizard-head">
          <h2>{STEPS[step]}</h2>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#71717a" }}>
            {step + 1} / {STEPS.length}
          </span>
        </div>
        <div className="ss-wizard-progress">
          <span style={{ width: `${progress}%` }} />
        </div>

        {step === 0 ? (
          <>
            <h3>{t("De quoi parle cette campagne ?", "What's this campaign about?", en)}</h3>
            <p className="ss-wizard-lead">
              {t(
                "Nomme ta campagne et définis le mix de contenu. On utilise ton contexte marque pour générer chaque post.",
                "Name your campaign and set the content mix. We'll use your brand context to generate every post.",
                en,
              )}
            </p>
            <label style={{ display: "block", marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", color: "#71717a" }}>NAME (OPTIONAL)</span>
              <input
                className="ss-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={new Date().toLocaleDateString(en ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric" }) + " Campaign"}
                style={{ marginTop: 8, width: "100%" }}
              />
            </label>
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", color: "#71717a", marginBottom: 8 }}>CONTENT MIX</p>
            <div className="ss-mix-bar">
              {mix.map((v, i) => (
                <span key={i} style={{ width: `${v}%`, background: MIX_COLORS[i] }} />
              ))}
            </div>
            {MIX_LABELS.map((label, i) => (
              <div key={label} className="ss-mix-row">
                <label>
                  <span className="ss-mix-dot" style={{ background: MIX_COLORS[i] }} />
                  {label}
                </label>
                <div className="ss-mix-controls">
                  <button type="button" onClick={() => adjustMix(i, -5)}>−</button>
                  <span style={{ minWidth: 36, textAlign: "center", fontWeight: 700 }}>{mix[i]}%</span>
                  <button type="button" onClick={() => adjustMix(i, 5)}>+</button>
                </div>
              </div>
            ))}
            <label style={{ display: "block", marginTop: 20 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", color: "#71717a" }}>REMIX RATIO · {remixRatio}%</span>
              <input type="range" min={0} max={100} value={remixRatio} onChange={(e) => setRemixRatio(Number(e.target.value))} style={{ width: "100%", marginTop: 8 }} />
              <p className="ss-wizard-lead" style={{ marginTop: 8, marginBottom: 0 }}>
                {t("Plus à droite = plus de remix de trends.", "Slide right for more remix from trending content.", en)}
              </p>
            </label>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <h3>{t("Style des captions ?", "How should the captions look?", en)}</h3>
            <p className="ss-wizard-lead">
              {t(
                "Chaque post pioche un style caption dans ce mix pour que la campagne ne se répète pas.",
                "Every post draws one caption look from this mix, so the campaign doesn't read as the same video on repeat.",
                en,
              )}
            </p>
            <button type="button" className="ss-btn-ghost">{t("Définir un mix de styles", "Set a caption style mix", en)}</button>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h3>{t("Balance tes angles", "How should we balance your angles?", en)}</h3>
            <p className="ss-wizard-lead">
              {t("Définis la fréquence de chaque angle de contenu dans la campagne.", "Set how often each content angle appears across the campaign.", en)}
            </p>
            {angles.map((angle, i) => (
              <div key={angle.id} className="ss-mix-row">
                <label>{angle.label}</label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={angle.weight}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setAngles((prev) => prev.map((a, j) => (j === i ? { ...a, weight: v } : a)));
                  }}
                  style={{ flex: 1 }}
                />
                <span style={{ minWidth: 40, fontWeight: 700 }}>{angle.weight}%</span>
              </div>
            ))}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <h3>{t("Voix de la campagne", "Set the voice of your campaign", en)}</h3>
            <p className="ss-wizard-lead">{t("À quelle fréquence mentionner ton produit ?", "How often to weave your business into the generated posts.", en)}</p>
            <div className="ss-segment">
              {(["never", "rarely", "sometimes", "often", "always"] as const).map((opt) => (
                <button key={opt} type="button" className={mention === opt ? "is-active" : ""} onClick={() => setMention(opt)}>
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {step > 3 && step < STEPS.length - 1 ? (
          <>
            <h3>{STEPS[step]}</h3>
            <p className="ss-wizard-lead">{t("Configuration de l'étape — continue pour finaliser.", "Step configuration — continue to finalize.", en)}</p>
          </>
        ) : null}

        {step === STEPS.length - 1 ? (
          <>
            <h3>{t("Prêt à lancer ?", "Ready to launch?", en)}</h3>
            <p className="ss-wizard-lead">{t("On va générer les posts et les ajouter à ton calendrier.", "We'll generate posts and add them to your calendar.", en)}</p>
          </>
        ) : null}

        <div className="ss-wizard-footer">
          <button type="button" className="ss-btn-ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            ← {t("Retour", "Back", en)}
          </button>
          <button type="button" className="ss-btn-purple" disabled={saving} onClick={() => void goNext()}>
            {step === STEPS.length - 1 ? t("Lancer", "Launch", en) : t("Continuer →", "Continue →", en)}
          </button>
        </div>
      </div>
    </div>
  );
}
