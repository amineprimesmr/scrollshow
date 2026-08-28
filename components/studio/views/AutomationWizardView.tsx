"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import { platformName } from "@/lib/platforms";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useStudio } from "../StudioContext";

const STEPS = ["Basics", "Cadence", "Launch"];
const TARGETS = [3, 5, 7, 14];
const SPACINGS = [1, 2, 3];

type Props = { automationId: string };

export function AutomationWizardView({ automationId }: Props) {
  const router = useRouter();
  const { channels, posts } = useStudio();
  const [english, setEnglish] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [channelId, setChannelId] = useState("");
  const [postsTarget, setPostsTarget] = useState(5);
  const [scheduleDays, setScheduleDays] = useState(1);
  const [postTime, setPostTime] = useState("18:00");
  const [saving, setSaving] = useState(false);
  const [launchError, setLaunchError] = useState("");

  useEffect(() => setEnglish(prefersEnglish()), []);

  useEffect(() => {
    fetch(`/api/studio/automations/${automationId}`)
      .then((r) => r.json())
      .then((json) => {
        const a = json.automation;
        if (!a) return;
        setName(a.name || "");
        if (a.channelId) setChannelId(a.channelId);
        if (a.postsTarget) setPostsTarget(a.postsTarget);
        if (a.scheduleDays) setScheduleDays(a.scheduleDays);
        if (a.postTime) setPostTime(a.postTime);
      });
  }, [automationId]);

  const tiktokChannels = channels.filter((c) => c.platform === "tiktok" && c.connected);
  const draftCount = posts.filter((p) => p.status === "draft").length;
  const en = english;

  async function save() {
    setSaving(true);
    await fetch(`/api/studio/automations/${automationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name || undefined,
        channelId: channelId || undefined,
        postsTarget,
        scheduleDays,
        postTime,
      }),
    });
    setSaving(false);
  }

  async function goNext() {
    await save();
    if (step === STEPS.length - 1) {
      setLaunchError("");
      const res = await fetch(`/api/studio/automations/${automationId}/launch`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLaunchError(
          json.error === "no_content"
            ? t(
                "Aucun brouillon à planifier. Importe ou crée du contenu d'abord.",
                "No drafts to schedule. Import or create content first.",
                en,
              )
            : json.error === "no_channel"
              ? t("Connecte un compte TikTok pour lancer cette automation.", "Connect a TikTok account to launch this automation.", en)
              : t("Le lancement a échoué. Réessaie.", "Launch failed. Try again.", en),
        );
        return;
      }
      router.push("/app/automations");
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

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
                "Nomme ta campagne et choisis le compte TikTok qui recevra les posts.",
                "Name your campaign and pick the TikTok account that receives the posts.",
                en,
              )}
            </p>
            <label style={{ display: "block", marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", color: "#71717a" }}>
                {t("NOM (OPTIONNEL)", "NAME (OPTIONAL)", en)}
              </span>
              <input
                className="ss-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={new Date().toLocaleDateString(en ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric" }) + " Campaign"}
                style={{ marginTop: 8, width: "100%" }}
              />
            </label>
            <label style={{ display: "block" }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", color: "#71717a" }}>
                {t("COMPTE", "ACCOUNT", en)}
              </span>
              {tiktokChannels.length ? (
                <select className="ss-input" value={channelId} onChange={(e) => setChannelId(e.target.value)} style={{ marginTop: 8, width: "100%" }}>
                  {tiktokChannels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {platformName(c.platform)}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="ss-wizard-lead" style={{ marginTop: 8 }}>
                  {t("Aucun compte TikTok connecté.", "No TikTok account connected.", en)}{" "}
                  <Link href="/app/integrations">{t("Connecter", "Connect", en)}</Link>
                </p>
              )}
            </label>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <h3>{t("À quel rythme ?", "How often?", en)}</h3>
            <p className="ss-wizard-lead">
              {t(
                "On planifie tes brouillons existants — celui créé en premier part en premier.",
                "We'll schedule your existing drafts — the oldest one goes out first.",
                en,
              )}
            </p>
            <label style={{ display: "block", marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", color: "#71717a" }}>
                {t("NOMBRE DE POSTS", "NUMBER OF POSTS", en)}
              </span>
              <div className="ss-segment" style={{ marginTop: 8 }}>
                {TARGETS.map((n) => (
                  <button key={n} type="button" className={postsTarget === n ? "is-active" : ""} onClick={() => setPostsTarget(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </label>
            <label style={{ display: "block", marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", color: "#71717a" }}>
                {t("ESPACEMENT", "SPACING", en)}
              </span>
              <div className="ss-segment" style={{ marginTop: 8 }}>
                {SPACINGS.map((n) => (
                  <button key={n} type="button" className={scheduleDays === n ? "is-active" : ""} onClick={() => setScheduleDays(n)}>
                    {n === 1 ? t("Chaque jour", "Every day", en) : t(`Tous les ${n} jours`, `Every ${n} days`, en)}
                  </button>
                ))}
              </div>
            </label>
            <label style={{ display: "block" }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", color: "#71717a" }}>
                {t("HEURE", "TIME", en)}
              </span>
              <input type="time" className="ss-input" value={postTime} onChange={(e) => setPostTime(e.target.value)} style={{ marginTop: 8, width: "100%" }} />
            </label>
          </>
        ) : null}

        {step === STEPS.length - 1 ? (
          <>
            <h3>{t("Prêt à lancer ?", "Ready to launch?", en)}</h3>
            <p className="ss-wizard-lead">
              {draftCount
                ? t(
                    `On va planifier jusqu'à ${Math.min(postsTarget, draftCount)} de tes ${draftCount} brouillon${draftCount > 1 ? "s" : ""} sur ${name || "cette campagne"}, un tous les ${scheduleDays} jour${scheduleDays > 1 ? "s" : ""} à ${postTime}.`,
                    `We'll schedule up to ${Math.min(postsTarget, draftCount)} of your ${draftCount} draft${draftCount > 1 ? "s" : ""}, one every ${scheduleDays} day${scheduleDays > 1 ? "s" : ""} at ${postTime}.`,
                    en,
                  )
                : t(
                    "Tu n'as aucun brouillon pour l'instant — importe ou crée du contenu avant de lancer.",
                    "You don't have any drafts yet — import or create content before launching.",
                    en,
                  )}
            </p>
            {launchError ? (
              <p className="ss-wizard-lead" style={{ color: "#dc2626" }}>
                {launchError}
              </p>
            ) : null}
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
