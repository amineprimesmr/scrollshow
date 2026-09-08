"use client";

import { t } from "@/lib/i18n";
import { FIX_TEXT, ROUNDS, type FixId, type Round, type RoundsReport, type Signal, type SignalId } from "@/lib/shadowban-rounds";

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

const FIX_FR: Record<FixId, string> = {
  post_more: "Publie au moins 5 fois pour que l'histogramme ait un sens.",
  change_how_you_post: "Change la façon de poster, pas le contenu : pause 48–72h, puis 1 post/jour depuis le téléphone avec un son de la bibliothèque, à 6h d'écart minimum.",
  dont_recreate: "Ne recrée pas le compte sauf si le Statut du compte affiche des sanctions — les restrictions expirent d'elles-mêmes.",
  fix_hook: "Corrige la slide 1 / les 1,5 premières secondes : un chiffre précis + un objet concret + une erreur ou une règle.",
  clone_format: "Clone un format qui marche déjà dans ta niche (comptes à médiane stable 100k+/30j, pas un seul coup viral).",
  unique_captions: "Une légende unique par post et des hashtags qui tournent — le contenu quasi identique dé-recommande tout le compte.",
  spread_posting: "Étale les publications : jamais plusieurs posts dans l'heure, 3 par jour max, jamais le même post en miroir sur plusieurs comptes.",
  check_account_status: "Des posts à 0 vue n'ont jamais été diffusés : vérifie le Statut du compte dans TikTok (sanction) et que le compte/post n'est pas privé.",
  keep_going: "Rien à corriger : garde la cadence, des légendes uniques, et continue de tester les accroches de la slide 1.",
};

function signalDetail(s: Signal, en: boolean) {
  switch (s.id) {
    case "burst_posting":
      return t(`${s.count} posts publiés à moins d'1h d'écart`, `${s.count} posts published less than 1h apart`, en);
    case "high_daily_rate":
      return t(`${s.count} jour(s) avec plus de 3 posts`, `${s.count} day(s) with more than 3 posts`, en);
    case "duplicate_captions":
      return t(`${s.count} posts partagent une légende identique`, `${s.count} posts share an identical caption`, en);
    case "repeated_hashtags":
      return t(`le même jeu de hashtags sur ${s.count} posts`, `the same hashtag set on ${s.count} posts`, en);
    case "zero_view_posts":
      return t(`${s.count} post(s) à 0 vue — jamais diffusé(s)`, `${s.count} post(s) with zero views — never seeded`, en);
  }
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function fmt(n: number, en: boolean) {
  return Math.round(n).toLocaleString(en ? "en-US" : "fr-FR");
}

function diagColor(d: RoundsReport["diagnosis"]) {
  if (d === "throttled" || d === "content_fails_seed") return { bg: "var(--ss-err-bg)", fg: "var(--ss-err-fg)" };
  if (d === "mixed" || d === "insufficient_data") return { bg: "var(--ss-warn-bg)", fg: "var(--ss-warn-fg)" };
  return { bg: "var(--ss-ok-bg)", fg: "var(--ss-ok-fg)" };
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
  const color = diagColor(rounds.diagnosis);
  const diag = diagnosisCopy(rounds, en);
  const maxCount = Math.max(1, ...Object.values(rounds.histogram));
  const trend = rounds.trend.changePct;

  return (
    <div className="ss-rounds">
      <div className="ss-rounds__score" style={{ background: color.bg, color: color.fg }}>
        <div className="ss-rounds__diag">
          <span className="ss-rounds__label">{t("Distribution", "Distribution", en)}</span>
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
                  <i style={{ width: `${(count / maxCount) * 100}%`, background: r.id === "R0" ? "var(--ss-err-fg)" : r.id === "R1" ? "var(--ss-warn-fg)" : "var(--ss-ink)" }} />
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
                  <small>{signalDetail(s, en)}</small>
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
              <li key={fix}>{en ? FIX_TEXT[fix] : FIX_FR[fix]}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
