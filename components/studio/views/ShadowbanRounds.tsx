"use client";

import { t } from "@/lib/i18n";
import { ROUNDS, type Round, type RoundsReport, type SignalId } from "@/lib/shadowban-rounds";

const ROUND_COPY: Record<Round, { range: string; fr: string; en: string }> = {
  R0: { range: "< 200", fr: "Jamais sorti du lot de test", en: "Never left the seed batch" },
  R1: { range: "200–500", fr: "Testé, pas relancé", en: "Seeded, no expansion" },
  R2: { range: "500–2k", fr: "Une relance", en: "One expansion" },
  R3: { range: "2k–20k", fr: "Traction FYP", en: "FYP traction" },
  R4: { range: "> 20k", fr: "Viral", en: "Viral" },
};

const SIGNAL_COPY: Record<SignalId, { fr: string; en: string }> = {
  burst_posting: { fr: "Posts publiés à moins d'1h d'écart (pattern automatisé)", en: "Posts published less than 1h apart (automation pattern)" },
  high_daily_rate: { fr: "Plus de 3 posts dans une journée", en: "More than 3 posts in a day" },
  duplicate_captions: { fr: "Légendes identiques sur plusieurs posts", en: "Identical captions across posts" },
  repeated_hashtags: { fr: "Mêmes hashtags sur ≥ 60 % des posts", en: "Same hashtags on ≥ 60% of posts" },
  zero_view_posts: { fr: "Posts à 0 vue (jamais diffusés)", en: "Zero-view posts (never seeded)" },
};

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function fmt(n: number, en: boolean) {
  return Math.round(n).toLocaleString(en ? "en-US" : "fr-FR");
}

function scoreColor(p: number) {
  if (p >= 60) return { bg: "#fef2f2", fg: "#991b1b", bar: "#dc2626" };
  if (p >= 30) return { bg: "#fffbeb", fg: "#92400e", bar: "#f59e0b" };
  return { bg: "#ecfdf5", fg: "#065f46", bar: "#10b981" };
}

function diagnosisCopy(r: RoundsReport, en: boolean) {
  switch (r.diagnosis) {
    case "throttled":
      return {
        title: t("Compte bridé (throttled)", "Account throttled", en),
        body: t(
          `Médiane basse (${fmt(r.medianViews, en)} vues) mais engagement sain (${pct(r.medianEngagement)}) : les gens qui voient tes posts les aiment, TikTok ne les diffuse simplement pas. À corriger : la façon de poster, pas le contenu.`,
          `Low median (${fmt(r.medianViews, en)} views) but healthy engagement (${pct(r.medianEngagement)}): people who see your posts like them, TikTok just won't distribute. Fix how you post, not what.`,
          en,
        ),
      };
    case "content_fails_seed":
      return {
        title: t("Le contenu échoue au test de départ", "Content fails the seed test", en),
        body: t(
          `${pct(r.r0Share)} des posts restent sous 200 vues et l'engagement est faible (${pct(r.medianEngagement)}). Ce n'est pas un bridage : le lot de test ne retient pas. À corriger : la slide 1 et les 1,5 premières secondes.`,
          `${pct(r.r0Share)} of posts stay under 200 views and engagement is weak (${pct(r.medianEngagement)}). This is not throttling: the seed batch doesn't retain. Fix slide 1 and the first 1.5 s.`,
          en,
        ),
      };
    case "mixed":
      return {
        title: t("Signaux mixtes", "Mixed signals", en),
        body: t(
          `Médiane ${fmt(r.medianViews, en)} vues, engagement ${pct(r.medianEngagement)}. Pas de verdict net : applique les deux familles de correctifs ci-dessous et recompare dans 7 jours.`,
          `Median ${fmt(r.medianViews, en)} views, engagement ${pct(r.medianEngagement)}. No clear verdict: apply both fix families below and compare again in 7 days.`,
          en,
        ),
      };
    case "insufficient_data":
      return {
        title: t("Pas assez de posts", "Not enough posts", en),
        body: t("Il faut au moins 5 posts pour que l'histogramme ait un sens.", "At least 5 posts are needed for the histogram to mean anything.", en),
      };
    default:
      return {
        title: t("Distribution saine", "Healthy distribution", en),
        body: t(
          `Médiane ${fmt(r.medianViews, en)} vues, ${pct(r.r0Share)} des posts sous 200 vues. Rien n'indique un bridage.`,
          `Median ${fmt(r.medianViews, en)} views, ${pct(r.r0Share)} of posts under 200 views. Nothing points to throttling.`,
          en,
        ),
      };
  }
}

export function ShadowbanRounds({ rounds, en }: { rounds: RoundsReport; en: boolean }) {
  const color = scoreColor(rounds.probability);
  const diag = diagnosisCopy(rounds, en);
  const maxCount = Math.max(1, ...Object.values(rounds.histogram));
  const trend = rounds.trend.changePct;

  return (
    <div className="ss-rounds">
      <div className="ss-rounds__score" style={{ background: color.bg, color: color.fg }}>
        <div>
          <span className="ss-rounds__label">{t("Probabilité de shadowban", "Shadowban probability", en)}</span>
          <b className="ss-rounds__value">{rounds.probability}</b>
          <span className="ss-rounds__of">/ 100</span>
          <div className="ss-rounds__bar">
            <i style={{ width: `${rounds.probability}%`, background: color.bar }} />
          </div>
          <small>
            {t("R0", "R0", en)} {rounds.scoreBreakdown.r0} · {t("médiane", "median", en)} {rounds.scoreBreakdown.median} · {t("0 vue", "0 views", en)} {rounds.scoreBreakdown.zero} ·{" "}
            {t("rafales", "bursts", en)} {rounds.scoreBreakdown.burst} · {t("doublons", "duplicates", en)} {rounds.scoreBreakdown.duplicates}
          </small>
        </div>
        <div className="ss-rounds__diag">
          <h3>{diag.title}</h3>
          <p>{diag.body}</p>
          {trend != null ? (
            <p className="ss-rounds__trend">
              {t("10 derniers vs 10 précédents :", "Last 10 vs previous 10:", en)}{" "}
              <b>{trend >= 0 ? "+" : ""}{Math.round(trend * 100)}%</b>{" "}
              ({fmt(rounds.trend.last10Median, en)} {t("vs", "vs", en)} {fmt(rounds.trend.previous10Median, en)} {t("vues médianes", "median views", en)})
            </p>
          ) : null}
        </div>
      </div>

      <div className="ss-chart-card">
        <div className="ss-chart-card__head">
          <div>
            <h2>{t("Posts par round de distribution", "Posts by distribution round", en)}</h2>
            <p>
              {t(
                "TikTok diffuse par rounds : chaque post reçoit un lot de test (~200–500 vues) et n'obtient le suivant que si rétention, complétion et enregistrements passent la barre. L'histogramme compte, pas la moyenne.",
                "TikTok distributes in rounds: every post gets a seed batch (~200–500 views) and only earns the next one if watch-time, completion and saves clear the bar. The histogram is the diagnostic, not the average.",
                en,
              )}
            </p>
          </div>
        </div>
        <div className="ss-rounds__hist">
          {ROUNDS.map((r) => {
            const count = rounds.histogram[r.id];
            const copy = ROUND_COPY[r.id];
            return (
              <div key={r.id} className="ss-rounds__row">
                <div className="ss-rounds__round">
                  <b>{r.id}</b>
                  <span>{copy.range}</span>
                </div>
                <div className="ss-rounds__track">
                  <i style={{ width: `${(count / maxCount) * 100}%`, background: r.id === "R0" ? "#dc2626" : r.id === "R1" ? "#f59e0b" : "#0a0a0a" }} />
                </div>
                <div className="ss-rounds__count">
                  <b>{count}</b>
                  <span>{en ? copy.en : copy.fr}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="ss-rounds__grid">
        <div className="ss-panel">
          <h2>{t("Signaux détectés", "Signals found", en)}</h2>
          {rounds.signals.length ? (
            <ul className="ss-feat">
              {rounds.signals.map((s) => (
                <li key={s.id}>
                  <b>{en ? SIGNAL_COPY[s.id].en : SIGNAL_COPY[s.id].fr}</b>
                  <br />
                  <small>{s.detail}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ss-lead">{t("Aucun signal de spam ou d'automatisation sur les 30 derniers posts.", "No spam or automation signal on the last 30 posts.", en)}</p>
          )}
        </div>
        <div className="ss-panel">
          <h2>{t("Quoi faire", "What to do", en)}</h2>
          <ul className="ss-feat">
            {rounds.fixes.map((fix) => (
              <li key={fix}>{fix}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
