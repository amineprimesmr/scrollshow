"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import type { ShadowbanReport, VideoPoint } from "@/lib/shadowban";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStudio } from "../StudioContext";

const VERDICT_STYLE: Record<ShadowbanReport["verdict"], { bg: string; fg: string; barLow: string }> = {
  insufficient_data: { bg: "#f4f4f5", fg: "#52525b", barLow: "#a1a1aa" },
  none: { bg: "#ecfdf5", fg: "#065f46", barLow: "#a1a1aa" },
  mild: { bg: "#fffbeb", fg: "#92400e", barLow: "#f59e0b" },
  likely: { bg: "#fef2f2", fg: "#991b1b", barLow: "#dc2626" },
};

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

function Chart({ points, baselineAvgViews, en }: { points: VideoPoint[]; baselineAvgViews: number; en: boolean }) {
  const chrono = [...points].reverse(); // oldest -> newest, reading left to right
  const max = Math.max(1, ...chrono.map((p) => p.views), baselineAvgViews);
  const width = Math.max(360, chrono.length * 26);
  const height = 160;
  const gap = 6;
  const barWidth = Math.max(8, chrono.length ? width / chrono.length - gap : 20);
  const baselineY = baselineAvgViews > 0 ? height - (baselineAvgViews / max) * height : null;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={width} height={height + 24} viewBox={`0 0 ${width} ${height + 24}`} role="img" aria-label={t("Vues par vidéo dans le temps", "Views per video over time", en)}>
        {baselineY != null ? (
          <line x1={0} y1={baselineY} x2={width} y2={baselineY} stroke="#d4d4d8" strokeWidth={1.5} strokeDasharray="4 4" />
        ) : null}
        {chrono.map((p, i) => {
          const barHeight = Math.max(2, (p.views / max) * height);
          const x = i * (barWidth + gap);
          const y = height - barHeight;
          const color = p.isLow ? VERDICT_STYLE.likely.barLow : "#0a0a0a";
          return (
            <g key={p.id}>
              <rect x={x} y={y} width={barWidth} height={barHeight} rx={4} fill={color} opacity={p.bucket === "excluded" ? 0.35 : 1}>
                <title>
                  {fmtDate(p.createdAt, en)} — {fmtNum(p.views, en)} {t("vues", "views", en)}
                  {p.isLow ? ` (${t("chute", "collapsed", en)})` : ""}
                </title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="ss-shadow-legend">
        <span>
          <i style={{ background: "#0a0a0a" }} /> {t("Normal", "Normal", en)}
        </span>
        <span>
          <i style={{ background: VERDICT_STYLE.likely.barLow }} /> {t("En chute (< 30% de ta moyenne)", "Collapsed (< 30% of your average)", en)}
        </span>
        {baselineY != null ? (
          <span>
            <i className="ss-shadow-legend__line" /> {t("Moyenne de référence", "Baseline average", en)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function ShadowbanView() {
  const { channels } = useStudio();
  const [english, setEnglish] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [report, setReport] = useState<ShadowbanReport | null>(null);
  const [testTag, setTestTag] = useState("");
  const [showTable, setShowTable] = useState(false);

  const connected = channels.some((c) => c.platform === "tiktok" && c.connected);
  const en = english;

  useEffect(() => setEnglish(prefersEnglish()), []);
  useEffect(() => setTestTag(randomTag()), []);

  useEffect(() => {
    if (!connected) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch("/api/tiktok/shadowban")
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "shadowban_failed");
        setReport(json.report);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "shadowban_failed"))
      .finally(() => setLoading(false));
  }, [connected]);

  const style = report ? VERDICT_STYLE[report.verdict] : VERDICT_STYLE.insufficient_data;

  const verdictCopy = useMemo(() => {
    if (!report) return { title: "", body: "" };
    if (report.verdict === "likely") {
      return {
        title: t("Shadowban probable", "Likely shadowban", en),
        body: t(
          `Tes ${report.consecutiveLowCount} derniers posts ont chuté de ${pct(report.dropPct)} par rapport à ta moyenne. C'est la signature typique d'une suppression de portée.`,
          `Your last ${report.consecutiveLowCount} posts dropped ${pct(report.dropPct)} below your average. That's the typical signature of a reach suppression.`,
          en,
        ),
      };
    }
    if (report.verdict === "mild") {
      return {
        title: t("Signes légers", "Mild signs", en),
        body: t(
          `Baisse de ${pct(report.dropPct)} par rapport à ta moyenne, mais pas encore assez soutenue pour conclure à un shadowban. Un seul post faible n'est pas un signal — surveille les prochains jours.`,
          `A ${pct(report.dropPct)} dip versus your average, but not yet sustained enough to call it a shadowban. One weak post alone isn't a signal — watch the next few days.`,
          en,
        ),
      };
    }
    if (report.verdict === "insufficient_data") {
      return {
        title: t("Pas assez de données", "Not enough data", en),
        body: t(
          "Il faut au moins 5 posts récents pour comparer ta portée actuelle à ta moyenne. Publie un peu plus et reviens.",
          "We need at least 5 recent posts to compare your current reach to your average. Post a bit more and check back.",
          en,
        ),
      };
    }
    return {
      title: t("Aucun signe de shadowban", "No sign of a shadowban", en),
      body: t("Ta portée récente est cohérente avec ta moyenne. Rien d'anormal détecté.", "Your recent reach is consistent with your average. Nothing abnormal detected.", en),
    };
  }, [report, en]);

  if (!connected) {
    return (
      <div className="ss-empty">
        <h2>{t("Connecte TikTok d'abord", "Connect TikTok first", en)}</h2>
        <p>{t("On analyse tes vraies vidéos pour détecter une chute de portée.", "We analyze your real videos to detect a reach drop.", en)}</p>
        <Link className="ss-btn-purple" href="/app/integrations">
          {t("Connecter TikTok", "Connect TikTok", en)}
        </Link>
      </div>
    );
  }

  return (
    <div className="ss-shadow">
      <div className="ss-shadow-head">
        <h1>{t("Détecteur de shadowban", "Shadowban detector", en)}</h1>
        <p className="ss-lead">
          {t(
            "TikTok ne publie aucun statut officiel de shadowban. Cette analyse est une estimation, calculée sur tes vraies statistiques de vues, pas une confirmation de TikTok.",
            "TikTok publishes no official shadowban status. This analysis is an estimate computed from your real view stats, not a confirmation from TikTok.",
            en,
          )}
        </p>
      </div>

      {loading ? (
        <p className="ss-lead">{t("Analyse en cours…", "Analyzing…", en)}</p>
      ) : error ? (
        <p className="ss-lead">{t("Analyse impossible pour l'instant.", "Could not analyze right now.", en)}</p>
      ) : report ? (
        <>
          <div className="ss-shadow-verdict" style={{ background: style.bg, color: style.fg }}>
            <h2>{verdictCopy.title}</h2>
            <p>{verdictCopy.body}</p>
            {report.estimatedOnset ? (
              <p className="ss-shadow-onset">
                {t("Début estimé :", "Estimated onset:", en)} <b>{fmtDate(report.estimatedOnset, en)}</b>
              </p>
            ) : null}
          </div>

          {report.verdict !== "insufficient_data" ? (
            <>
              <div className="ss-stat-row">
                <div className="ss-stat-card">
                  <span>{t("Vues récentes (moy.)", "Recent views (avg)", en)}</span>
                  <b>{fmtNum(report.recentAvgViews, en)}</b>
                </div>
                <div className="ss-stat-card">
                  <span>{t("Vues de référence (moy.)", "Baseline views (avg)", en)}</span>
                  <b>{fmtNum(report.baselineAvgViews, en)}</b>
                </div>
                <div className="ss-stat-card">
                  <span>{t("Chute", "Drop", en)}</span>
                  <b>{pct(report.dropPct)}</b>
                </div>
                <div className="ss-stat-card">
                  <span>{t("Posts en chute", "Collapsed posts", en)}</span>
                  <b>{report.consecutiveLowCount}</b>
                </div>
              </div>

              <div className="ss-chart-card">
                <div className="ss-chart-card__head">
                  <div>
                    <h2>{t("Vues par vidéo", "Views per video", en)}</h2>
                    <p>
                      {t(
                        `${report.videoCount} dernières vidéos · fenêtre ${report.windowMode === "date" ? "7 vs 28 jours" : "récentes vs plus anciennes"}`,
                        `Last ${report.videoCount} videos · ${report.windowMode === "date" ? "7-day vs 28-day" : "recent vs older"} window`,
                        en,
                      )}
                    </p>
                  </div>
                </div>
                <Chart points={report.points} baselineAvgViews={report.baselineAvgViews} en={en} />
              </div>

              <button type="button" className="ss-btn-ghost" onClick={() => setShowTable((v) => !v)}>
                {showTable ? t("Masquer le détail", "Hide details", en) : t("Voir le détail par vidéo", "View per-video details", en)}
              </button>
              {showTable ? (
                <div className="ss-shadow-table">
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
                      {report.points.map((p) => (
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
            </>
          ) : null}
        </>
      ) : null}

      <div className="ss-panel ss-shadow-manual">
        <h2>{t("Vérifie toi-même (2 min)", "Verify it yourself (2 min)", en)}</h2>
        <p className="ss-lead">
          {t(
            "Ce que TikTok ne montre qu'à toi ne peut pas être vérifié depuis notre API. Voici comment tester ta visibilité réelle, avec un hashtag jetable qu'on te génère.",
            "What only TikTok shows you can't be checked from our API. Here's how to test your real visibility, with a throwaway hashtag we generate for you.",
            en,
          )}
        </p>
        <ol className="ss-shadow-steps">
          <li>
            {t("Poste une vidéo (même privée pour toi) avec ce hashtag unique :", "Post a video (any content) with this unique hashtag:", en)}{" "}
            <code className="ss-shadow-tag">#{testTag}</code>
          </li>
          <li>{t("Attends 30 à 60 minutes.", "Wait 30–60 minutes.", en)}</li>
          <li>
            {t(
              "Depuis un autre compte (ou déconnecté), cherche ce hashtag et va dans l'onglet « Récent ».",
              "From a different account (or logged out), search that hashtag and check the \"Recent\" tab.",
              en,
            )}
          </li>
          <li>
            {t(
              "Ta vidéo n'apparaît pas ? C'est un signe concret de suppression de portée, en plus de l'analyse ci-dessus.",
              "Your video doesn't show up? That's a concrete sign of reach suppression, on top of the analysis above.",
              en,
            )}
          </li>
        </ol>
        <button type="button" className="ss-btn-ghost" onClick={() => setTestTag(randomTag())}>
          {t("Générer un autre hashtag", "Generate another hashtag", en)}
        </button>
      </div>

      <div className="ss-panel ss-shadow-recover">
        <h2>{t("Comment en sortir", "How to recover", en)}</h2>
        <p className="ss-lead">
          {t(
            "TikTok ne confirme jamais un shadowban et il n'existe aucun moyen de le lever manuellement — il expire de lui-même. Ce qui accélère généralement le retour à la normale, d'après les créateurs et guides spécialisés :",
            "TikTok never confirms a shadowban and there's no way to manually lift one — it expires on its own. What generally speeds up recovery, per creators and specialized guides:",
            en,
          )}
        </p>
        <ul className="ss-feat">
          <li>{t("Arrête de poster 48 à 72h — continuer à publier pendant la chute prolonge souvent le signal négatif.", "Stop posting for 48–72h — posting through the dip often prolongs the negative signal.", en)}</li>
          <li>{t("Repasse tes derniers posts en revue : supprime ce qui enfreint les règles de la communauté (musique, contenu signalé, liens suspects).", "Review your last posts: remove anything against Community Guidelines (music, flagged content, suspicious links).", en)}</li>
          <li>{t("Évite les actions qui ressemblent à du spam (follow/unfollow en masse, commentaires répétitifs, republier vite).", "Avoid spam-looking behavior (mass follow/unfollow, repetitive comments, rapid reposting).", en)}</li>
          <li>{t("Déconnecte-toi et reconnecte-toi à l'app, vide le cache.", "Log out and back into the app, clear its cache.", en)}</li>
          <li>{t("Quand tu reprends, publie du contenu natif propre, sans forcer un CTA produit dès le premier post.", "When you resume, post clean native content — don't lead with a hard product CTA.", en)}</li>
        </ul>
        <p className="ss-lead">
          {t(
            "Durée typique observée : 3–5 jours pour une infraction mineure, 2 à 4 semaines dans le cas général, jusqu'à 60 jours pour une infraction grave.",
            "Typical observed duration: 3–5 days for a minor first offense, 2–4 weeks in the general case, up to 60 days for a serious violation.",
            en,
          )}
        </p>
      </div>
    </div>
  );
}
