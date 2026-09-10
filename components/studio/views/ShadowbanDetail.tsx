"use client";

import { t } from "@/lib/i18n";
import type { ShadowbanReport, VideoPoint } from "@/lib/shadowban";
import type { ShadowbanAccount } from "@/lib/shadowban-check";
import { useEffect, useState } from "react";
import { IconX } from "../icons";
import { ShadowbanRounds } from "./ShadowbanRounds";
import { compact, fmtPct1, fmtSigma, fmtSwing, LEVEL_COPY } from "./ShadowbanView";

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function fmtDate(iso: string, en: boolean) {
  return new Date(iso).toLocaleDateString(en ? "en-US" : "fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function fmtNum(n: number, en: boolean) {
  return Math.round(n).toLocaleString(en ? "en-US" : "fr-FR");
}

function randomTag() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 5; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return `sstest${out}`;
}

/**
 * Views per post, with the account's OWN normal band drawn behind them: the
 * range one ordinary post of this account lands in (baseline median, one
 * standard deviation each way, in log space). A post inside the band is not a
 * signal, however far below the median it looks in percent.
 */
function ViewsChart({ points, report, en }: { points: VideoPoint[]; report: ShadowbanReport; en: boolean }) {
  const chrono = [...points].reverse();
  const baseline = report.baselineMedianViews;
  const max = Math.max(10, ...chrono.map((p) => p.views), baseline);
  // Échelle logarithmique : un seul post à 1,4 M écrase tout le reste sur une
  // échelle linéaire, et c'est en log que le modèle raisonne de toute façon.
  const floor = Math.max(1, Math.min(report.reachFloor, ...chrono.map((p) => p.views || Infinity)) / 2);
  const span = Math.log(max) - Math.log(floor) || 1;
  const scale = (v: number) => Math.max(0, Math.min(100, ((Math.log(Math.max(floor, v)) - Math.log(floor)) / span) * 100));
  const bandLow = baseline > 0 ? baseline / report.swingFactor : 0;
  const bandHigh = baseline > 0 ? baseline * report.swingFactor : 0;
  return (
    <div className="ss-sb-chart">
      <div className="ss-sb-chart__bars" role="img" aria-label={t("Vues par vidéo dans le temps", "Views per video over time", en)}>
        {baseline > 0 ? (
          <span className="ss-sb-chart__band" style={{ bottom: `${scale(bandLow)}%`, height: `${Math.max(1, scale(bandHigh) - scale(bandLow))}%` }} />
        ) : null}
        {baseline > 0 ? <span className="ss-sb-chart__baseline" style={{ bottom: `${scale(baseline)}%` }} /> : null}
        {report.reachFloor > 0 ? <span className="ss-sb-chart__floor" style={{ bottom: `${scale(report.reachFloor)}%` }} /> : null}
        {chrono.map((p, i) => (
          <i
            key={p.id}
            className={p.state === "suppressed" ? "is-low" : p.state === "unusual" ? "is-unusual" : p.state === "fresh" ? "is-out" : ""}
            style={{ height: `${Math.max(2, scale(p.views))}%`, "--d": `${i * 22}ms` } as React.CSSProperties}
            title={`${fmtDate(p.createdAt, en)} — ${fmtNum(p.views, en)} ${t("vues", "views", en)}${
              p.state === "suppressed"
                ? ` (${t("non diffusé", "not distributed", en)})`
                : p.state === "unusual"
                  ? ` (${t("inhabituel pour ce compte", "unusual for this account", en)})`
                  : p.state === "fresh"
                    ? ` (${t("trop récent", "too recent", en)})`
                    : ""
            }`}
          />
        ))}
      </div>
      <div className="ss-shadow-legend">
        <span>
          <i style={{ background: "var(--ss-ink)" }} /> {t("Normal", "Normal", en)}
        </span>
        <span>
          <i style={{ background: "var(--ss-warn-fg)" }} /> {t("Inhabituel pour ce compte", "Unusual for this account", en)}
        </span>
        <span>
          <i style={{ background: "var(--ss-err-fg)" }} /> {t(`Non diffusé (< ${fmtNum(report.reachFloor, en)} vues)`, `Not distributed (< ${fmtNum(report.reachFloor, en)} views)`, en)}
        </span>
        {baseline > 0 ? (
          <span>
            <i className="ss-shadow-legend__band" /> {t("Zone normale du compte", "This account's normal range", en)}
          </span>
        ) : null}
        <span>{t("Échelle logarithmique", "Logarithmic scale", en)}</span>
      </div>
    </div>
  );
}

/**
 * Says what was measured, and — when nothing is wrong — why the drop the
 * creator can see on their own profile is not evidence of anything.
 */
function verdictCopy(account: ShadowbanAccount, en: boolean) {
  const r = account.report;
  const has = (id: string) => r.signals.find((s) => s.id === id);
  switch (account.level) {
    case "likely": {
      const zero = has("never_seeded");
      if (zero) {
        return t(
          `${zero.value} posts sont à 0 vue : TikTok ne les a jamais montrés à personne. Ce n'est pas une question de contenu, le post n'a pas été diffusé du tout.`,
          `${zero.value} posts sit at 0 views: TikTok never showed them to anyone. This isn't a content problem, the post was not distributed at all.`,
          en,
        );
      }
      const seed = has("stuck_in_seed");
      const starved = has("below_follower_reach");
      const collapse = has("reach_collapse");
      const parts = [
        seed ? t(`${seed.value} des ${r.videoCount >= 3 ? "derniers" : ""} posts restent sous ${fmtNum(r.reachFloor, en)} vues, le lot de test dont ils ne sont jamais sortis`, `${seed.value} recent posts stay under ${fmtNum(r.reachFloor, en)} views, the seed batch they never left`, en) : "",
        starved ? t(`la portée ne fait que ${fmtPct1(starved.value, en)} des abonnés, moins que ce que le fil « Abonnements » suffit à donner`, `reach is only ${fmtPct1(starved.value, en)} of the follower base, less than the Following feed alone delivers`, en) : "",
        collapse ? t(`la médiane récente est à ${fmtSigma(collapse.value, en)} de la normale du compte, sous tout ce qu'il avait produit`, `the recent median sits ${fmtSigma(collapse.value, en)} from this account's own normal, below anything it had produced`, en) : "",
      ].filter(Boolean);
      return t(
        `Deux mesures concordent : ${parts.join(" ; ")}. C'est la signature d'une suppression de portée, pas d'une mauvaise série.`,
        `Two measurements agree: ${parts.join("; ")}. That's the signature of reach suppression, not of a bad run.`,
        en,
      );
    }
    case "mild":
      return t(
        `Un seul signal, pas deux : ${fmtSigma(r.zScore, en)} sous la normale du compte, qui varie déjà de ${fmtSwing(r.swingFactor, en)} d'un post à l'autre. Pas de quoi conclure — à recomparer dans quelques jours.`,
        `One signal, not two: ${fmtSigma(r.zScore, en)} below this account's normal, and it already swings ${fmtSwing(r.swingFactor, en)} between posts. Not enough to conclude — compare again in a few days.`,
        en,
      );
    case "insufficient":
      return t(
        `Il faut au moins 5 posts de plus de 48 h pour mesurer quoi que ce soit${r.freshCount ? ` (${r.freshCount} post(s) encore trop récent(s), les vues montent encore)` : ""}.`,
        `At least 5 posts older than 48h are needed to measure anything${r.freshCount ? ` (${r.freshCount} post(s) still too recent, views are still climbing)` : ""}.`,
        en,
      );
    default: {
      const drop = Math.round(r.dropPct * 100);
      if (r.dropPct >= 0.4) {
        return t(
          `La portée récente est ${drop} % sous la médiane, et c'est normal : ce compte varie de ${fmtSwing(r.swingFactor, en)} d'un post à l'autre, donc cette baisse ne fait que ${fmtSigma(r.zScore, en)}. Aucun post n'est resté sous le plancher de diffusion (${fmtNum(r.reachFloor, en)} vues). Un pourcentage de baisse ne prouve rien : un shadowban se voit à des posts qui ne sortent pas du lot de test, pas à des posts qui ne percent pas.`,
          `Recent reach is ${drop}% below the median, and that's normal: this account swings ${fmtSwing(r.swingFactor, en)} between posts, so the dip is only ${fmtSigma(r.zScore, en)}. No post stayed under the distribution floor (${fmtNum(r.reachFloor, en)} views). A drop percentage proves nothing: a shadowban shows up as posts that never leave the seed batch, not as posts that don't take off.`,
          en,
        );
      }
      return t(
        `Portée récente ${fmtNum(r.recentMedianViews, en)} vues, dans la zone normale du compte. Rien n'indique une suppression de portée.`,
        `Recent reach ${fmtNum(r.recentMedianViews, en)} median views, inside this account's normal range. Nothing points to reach suppression.`,
        en,
      );
    }
  }
}

export function ShadowbanDetail({ account, en, onClose }: { account: ShadowbanAccount; en: boolean; onClose: () => void }) {
  const [showTable, setShowTable] = useState(false);
  const [tag, setTag] = useState("");
  useEffect(() => setTag(randomTag()), []);
  const r = account.report;
  const level = account.level;
  const mine = account.source === "connected";

  return (
    <section className="ss-sb-detail" data-level={level} aria-label={`${account.name} — ${en ? LEVEL_COPY[level].en : LEVEL_COPY[level].fr}`}>
      <header className="ss-sb-detail__head">
        <span className="ss-sb-avatar" style={{ width: 52, height: 52 }}>
          {account.avatar ? <img src={account.avatar} alt="" width={52} height={52} /> : <b>{account.name.charAt(0).toUpperCase()}</b>}
        </span>
        <div className="ss-sb-detail__who">
          <h2>
            {account.name} <em className="ss-sb-chip" data-level={level}>{en ? LEVEL_COPY[level].en : LEVEL_COPY[level].fr}</em>
          </h2>
          <p>
            @{account.handle}
            {account.followers ? ` · ${compact(account.followers, en)} ${t("abonnés", "followers", en)}` : ""}
            {` · ${r.videoCount} ${t("posts analysés", "posts analyzed", en)}`}
          </p>
        </div>
        <button type="button" className="ss-sb-detail__close lg lg--lens lg-press" onClick={onClose} aria-label={t("Fermer", "Close", en)}>
          <IconX />
        </button>
      </header>

      <p className="ss-sb-detail__verdict">
        {verdictCopy(account, en)}
        {r.estimatedOnset ? (
          <>
            {" "}
            {t("Début estimé :", "Estimated onset:", en)} <b>{fmtDate(r.estimatedOnset, en)}</b>.
          </>
        ) : null}
      </p>

      <ShadowbanRounds rounds={r.rounds} en={en} swingFactor={r.swingFactor} volatility={r.volatility} verdict={r.verdict} />

      {level !== "insufficient" ? (
        <div className="ss-chart-card">
          <div className="ss-chart-card__head">
            <div>
              <h2>{t("Vues par vidéo", "Views per video", en)}</h2>
              <p>
                {t(
                  `${r.videoCount} posts mûrs · fenêtre ${r.windowMode === "date" ? "7 vs 28 jours" : "récents vs plus anciens"} · médiane récente ${fmtNum(r.recentMedianViews, en)} contre ${fmtNum(r.baselineMedianViews, en)} de référence · variation naturelle ${fmtSwing(r.swingFactor, en)}`,
                  `${r.videoCount} mature posts · ${r.windowMode === "date" ? "7-day vs 28-day" : "recent vs older"} window · recent median ${fmtNum(r.recentMedianViews, en)} vs ${fmtNum(r.baselineMedianViews, en)} baseline · natural swing ${fmtSwing(r.swingFactor, en)}`,
                  en,
                )}
              </p>
            </div>
            <button type="button" className="ss-btn-ghost" onClick={() => setShowTable((v) => !v)}>
              {showTable ? t("Masquer le détail", "Hide details", en) : t("Détail par vidéo", "Per-video details", en)}
            </button>
          </div>
          <ViewsChart points={r.points} report={r} en={en} />
          {showTable ? (
            <div className="ss-shadow-table ss-flash-in">
              <table>
                <thead>
                  <tr>
                    <th>{t("Date", "Date", en)}</th>
                    <th>{t("Vues", "Views", en)}</th>
                    <th>{t("Engagement", "Engagement", en)}</th>
                    <th>{t("Statut", "Status", en)}</th>
                  </tr>
                </thead>
                <tbody>
                  {r.points.map((p) => (
                    <tr key={p.id}>
                      <td>{fmtDate(p.createdAt, en)}</td>
                      <td>{fmtNum(p.views, en)}</td>
                      <td>{pct(p.engagementRate)}</td>
                      <td>
                        {p.state === "suppressed"
                          ? t("Non diffusé", "Not distributed", en)
                          : p.state === "unusual"
                            ? t("Inhabituel", "Unusual", en)
                            : p.state === "fresh"
                              ? t("Trop récent", "Too recent", en)
                              : p.bucket === "excluded"
                                ? t("Hors fenêtre", "Out of window", en)
                                : t("Normal", "Normal", en)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {level === "likely" || level === "mild" ? (
        <div className="ss-sb-detail__grid">
          <div className="ss-panel">
            <h2>{t("Comment en sortir", "How to recover", en)}</h2>
            <ul className="ss-feat">
              <li>{t("Pause de 48 à 72 h : continuer à publier pendant la chute prolonge souvent le signal négatif.", "Pause 48–72h: posting through the dip often prolongs the negative signal.", en)}</li>
              <li>{t("Relis les derniers posts et retire ce qui enfreint les règles (musique, contenu signalé, liens suspects).", "Review the last posts and remove anything against the rules (music, flagged content, suspicious links).", en)}</li>
              <li>{t("Aucune action qui ressemble à du spam : follow/unfollow en masse, commentaires répétés, republication rapide.", "No spam-looking behavior: mass follow/unfollow, repeated comments, rapid reposting.", en)}</li>
              <li>{t("À la reprise, du contenu natif propre, sans CTA produit dès le premier post.", "When resuming, clean native content, no product CTA on the first post.", en)}</li>
            </ul>
            <p className="ss-lead">
              {t("Durée typique : 3 à 5 jours pour une infraction mineure, 2 à 4 semaines en général, jusqu'à 60 jours pour une infraction grave.", "Typical duration: 3–5 days for a minor offense, 2–4 weeks in general, up to 60 days for a serious violation.", en)}
            </p>
          </div>
          {mine ? (
            <div className="ss-panel">
              <h2>{t("Confirme en 2 minutes", "Confirm in 2 minutes", en)}</h2>
              <ol className="ss-shadow-steps">
                <li>
                  {t("Poste une vidéo avec ce hashtag unique :", "Post a video with this unique hashtag:", en)} <code className="ss-shadow-tag">#{tag}</code>
                </li>
                <li>{t("Attends 30 à 60 minutes.", "Wait 30–60 minutes.", en)}</li>
                <li>{t("Depuis un autre compte, cherche le hashtag, onglet « Récent ».", "From another account, search the hashtag, \"Recent\" tab.", en)}</li>
                <li>{t("La vidéo n'apparaît pas ? Suppression de portée confirmée.", "The video doesn't show? Reach suppression confirmed.", en)}</li>
              </ol>
              <button type="button" className="ss-btn-ghost" onClick={() => setTag(randomTag())}>
                {t("Autre hashtag", "Another hashtag", en)}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
