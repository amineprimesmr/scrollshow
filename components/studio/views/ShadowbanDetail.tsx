"use client";

import { t } from "@/lib/i18n";
import type { VideoPoint } from "@/lib/shadowban";
import type { ShadowbanAccount } from "@/lib/shadowban-check";
import { useEffect, useState } from "react";
import { IconX } from "../icons";
import { ShadowbanRounds } from "./ShadowbanRounds";
import { compact, LEVEL_COPY } from "./ShadowbanView";

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

function ViewsChart({ points, baseline, en }: { points: VideoPoint[]; baseline: number; en: boolean }) {
  const chrono = [...points].reverse();
  const max = Math.max(1, ...chrono.map((p) => p.views), baseline);
  const baselinePct = baseline > 0 ? Math.sqrt(baseline / max) * 100 : null;
  return (
    <div className="ss-sb-chart">
      <div className="ss-sb-chart__bars" role="img" aria-label={t("Vues par vidéo dans le temps", "Views per video over time", en)}>
        {baselinePct != null ? <span className="ss-sb-chart__baseline" style={{ bottom: `${baselinePct}%` }} /> : null}
        {chrono.map((p, i) => (
          <i
            key={p.id}
            className={p.isLow ? "is-low" : p.bucket === "excluded" ? "is-out" : ""}
            style={{ height: `${Math.max(2, Math.sqrt(p.views / max) * 100)}%`, "--d": `${i * 22}ms` } as React.CSSProperties}
            title={`${fmtDate(p.createdAt, en)} — ${fmtNum(p.views, en)} ${t("vues", "views", en)}${p.isLow ? ` (${t("chute", "collapsed", en)})` : ""}`}
          />
        ))}
      </div>
      <div className="ss-shadow-legend">
        <span>
          <i style={{ background: "var(--ss-ink)" }} /> {t("Normal", "Normal", en)}
        </span>
        <span>
          <i style={{ background: "var(--ss-err-fg)" }} /> {t("En chute (< 30 % de la médiane)", "Collapsed (< 30% of the median)", en)}
        </span>
        {baselinePct != null ? (
          <span>
            <i className="ss-shadow-legend__line" /> {t("Médiane de référence", "Baseline median", en)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function verdictCopy(account: ShadowbanAccount, en: boolean) {
  const r = account.report;
  switch (account.level) {
    case "likely":
      return t(
        `Les ${r.consecutiveLowCount} derniers posts ont chuté de ${pct(r.dropPct)} par rapport à la médiane du compte. C'est la signature typique d'une suppression de portée.`,
        `The last ${r.consecutiveLowCount} posts dropped ${pct(r.dropPct)} below the account's median. That's the typical signature of a reach suppression.`,
        en,
      );
    case "mild":
      return t(
        `Baisse de ${pct(r.dropPct)} par rapport à la médiane, pas encore assez soutenue pour conclure. Un seul post faible n'est pas un signal : à surveiller sur les prochains jours.`,
        `A ${pct(r.dropPct)} dip versus the median, not yet sustained enough to conclude. One weak post alone isn't a signal: watch the next few days.`,
        en,
      );
    case "insufficient":
      return t(
        "Il faut au moins 5 posts récents pour comparer la portée actuelle à la médiane du compte.",
        "At least 5 recent posts are needed to compare current reach to the account's median.",
        en,
      );
    default:
      return t("La portée récente est cohérente avec la médiane du compte. Rien d'anormal détecté.", "Recent reach is consistent with the account's median. Nothing abnormal detected.", en);
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

      <ShadowbanRounds rounds={r.rounds} en={en} />

      {level !== "insufficient" ? (
        <div className="ss-chart-card">
          <div className="ss-chart-card__head">
            <div>
              <h2>{t("Vues par vidéo", "Views per video", en)}</h2>
              <p>
                {t(
                  `${r.videoCount} dernières vidéos · fenêtre ${r.windowMode === "date" ? "7 vs 28 jours" : "récentes vs plus anciennes"} · médiane récente ${fmtNum(r.recentAvgViews, en)} contre ${fmtNum(r.baselineAvgViews, en)} de référence`,
                  `Last ${r.videoCount} videos · ${r.windowMode === "date" ? "7-day vs 28-day" : "recent vs older"} window · recent median ${fmtNum(r.recentAvgViews, en)} vs ${fmtNum(r.baselineAvgViews, en)} baseline`,
                  en,
                )}
              </p>
            </div>
            <button type="button" className="ss-btn-ghost" onClick={() => setShowTable((v) => !v)}>
              {showTable ? t("Masquer le détail", "Hide details", en) : t("Détail par vidéo", "Per-video details", en)}
            </button>
          </div>
          <ViewsChart points={r.points} baseline={r.baselineAvgViews} en={en} />
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
                      <td>{p.isLow ? t("En chute", "Collapsed", en) : p.bucket === "excluded" ? t("Hors fenêtre", "Out of window", en) : t("Normal", "Normal", en)}</td>
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
