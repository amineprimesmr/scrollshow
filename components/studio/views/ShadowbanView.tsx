"use client";

import { t } from "@/lib/i18n";
import type { ShadowbanAccount, ShadowbanLevel } from "@/lib/shadowban-check";
import type { Account } from "@/lib/types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useStudio } from "../StudioContext";
import { IconX } from "../icons";
import { Beam } from "@/components/fx/Beam";
import { Metal } from "@/components/fx/Metal";
import { Orb } from "@/components/fx/Orb";
import { ShadowbanDetail } from "./ShadowbanDetail";

/** A card's lifecycle: connected accounts start analyzing, lookups arrive done. */
type Identity = { key: string; handle: string; name: string; avatar: string; followers: number; source: "connected" | "library" };

export type CardState =
  | (Identity & { status: "loading" })
  | (Identity & { status: "error"; error: string })
  | { key: string; status: "done"; account: ShadowbanAccount };

export const LEVEL_COPY: Record<ShadowbanLevel, { fr: string; en: string }> = {
  none: { fr: "Aucun risque", en: "No risk" },
  mild: { fr: "À surveiller", en: "Watch" },
  likely: { fr: "Shadowban", en: "Shadowban" },
  insufficient: { fr: "Pas assez de posts", en: "Not enough posts" },
};

/** How many views a post needs before it can be called "not distributed". */
export function fmtFloor(n: number, en: boolean) {
  return Math.round(n).toLocaleString(en ? "en-US" : "fr-FR");
}

/** The account's own swing, read as a multiple: "varies by x5.5 between posts". */
export function fmtSwing(n: number, en: boolean) {
  return `×${n.toFixed(1).replace(".", en ? "." : ",")}`;
}

/** One decimal, with the decimal separator of the reader's language. */
export function fmtPct1(ratio: number, en: boolean) {
  return `${(ratio * 100).toFixed(1).replace(".", en ? "." : ",")} %`;
}

export function fmtSigma(z: number, en: boolean) {
  const value = Math.abs(z).toFixed(1).replace(".", en ? "." : ",");
  return `${z < 0 ? "−" : "+"}${value} σ`;
}

/**
 * One line under the indicator: the measured fact behind it. Never a
 * percentage drop on its own — that was the whole bug: an account that swings
 * by a factor of five between two posts was told it was banned every time a
 * post landed low.
 */
export function reasonOf(account: ShadowbanAccount, en: boolean) {
  const r = account.report;
  const has = (id: string) => r.signals.find((s) => s.id === id);
  if (account.level === "insufficient") return t(`${r.videoCount} post(s) exploitable(s), il en faut 5.`, `${r.videoCount} usable post(s), 5 needed.`, en);

  const zero = has("never_seeded");
  if (zero) return t(`${zero.value} posts à 0 vue, jamais diffusés.`, `${zero.value} posts at 0 views, never seeded.`, en);
  const seed = has("stuck_in_seed");
  if (seed) return t(`${seed.value} posts récents sous ${fmtFloor(r.reachFloor, en)} vues : jamais sortis du lot de test.`, `${seed.value} recent posts under ${fmtFloor(r.reachFloor, en)} views: never left the seed batch.`, en);
  const starved = has("below_follower_reach");
  if (starved) return t(`Portée à ${fmtPct1(starved.value, en)} des abonnés seulement.`, `Reach at just ${fmtPct1(starved.value, en)} of the follower base.`, en);
  const collapse = has("reach_collapse");
  if (collapse) return t(`Chute de ${fmtSigma(collapse.value, en)} sous la normale du compte, sous tout ce qu'il avait fait.`, `Down ${fmtSigma(collapse.value, en)} from this account's own normal, below anything it had done.`, en);
  if (account.level === "mild") {
    if (r.rounds.r0Share >= 0.4) return t(`${Math.round(r.rounds.r0Share * 100)} % des posts restent sous 200 vues.`, `${Math.round(r.rounds.r0Share * 100)}% of posts stay under 200 views.`, en);
    return t(`Baisse de ${fmtSigma(r.zScore, en)}, à surveiller sans conclure.`, `Down ${fmtSigma(r.zScore, en)}, worth watching, not a conclusion.`, en);
  }
  if (r.volatility === "erratic") {
    return t(
      `Portée normale pour ce compte : il varie de ${fmtSwing(r.swingFactor, en)} d'un post à l'autre.`,
      `Normal reach for this account: it swings ${fmtSwing(r.swingFactor, en)} between posts.`,
      en,
    );
  }
  return t(`Portée stable sur les ${r.videoCount} derniers posts.`, `Reach steady over the last ${r.videoCount} posts.`, en);
}

export function compact(n: number, en: boolean) {
  return new Intl.NumberFormat(en ? "en-US" : "fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function Avatar({ src, name, size = 44 }: { src: string; name: string; size?: number }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <span className="ss-sb-avatar" style={{ width: size, height: size }}>
      {src ? <img src={src} alt="" width={size} height={size} loading="lazy" /> : <b>{initial}</b>}
    </span>
  );
}

const ICONS: Record<ShadowbanLevel, React.ReactNode> = {
  none: <path d="M6 12.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />,
  mild: <path d="M12 6v8M12 18h.01" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />,
  likely: (
    <>
      <path d="M3 3l18 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M10.6 5.2A10 10 0 0 1 21 12a10.6 10.6 0 0 1-2.6 3.6M6.4 6.4A10.6 10.6 0 0 0 3 12a10 10 0 0 0 13.4 4.8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  insufficient: <path d="M7 12h10" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />,
};

/** The indicator: a coloured disc with an icon, or a spinning arc while pending. */
function Indicator({ level, pending }: { level: ShadowbanLevel | null; pending: boolean }) {
  return (
    <div className={`ss-sb-ind ${pending ? "is-pending" : ""}`} data-level={level || ""}>
      {pending ? (
        <Orb size={64} state="searching" />
      ) : (
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden>
          {ICONS[level || "insufficient"]}
        </svg>
      )}
    </div>
  );
}

/** Log scale, like the model: otherwise one viral post flattens the other thirteen. */
function Sparkline({ account }: { account: ShadowbanAccount }) {
  const points = useMemo(() => [...account.report.points].reverse().slice(-14), [account]);
  const max = Math.max(10, ...points.map((p) => p.views));
  const floor = Math.max(1, Math.min(account.report.reachFloor, ...points.map((p) => p.views || Infinity)) / 2);
  const span = Math.log(max) - Math.log(floor) || 1;
  return (
    <div className="ss-sb-spark" aria-hidden>
      {points.map((p, i) => (
        <i
          key={p.id}
          className={p.state === "suppressed" ? "is-low" : p.state === "unusual" ? "is-unusual" : ""}
          style={{ height: `${Math.max(8, ((Math.log(Math.max(floor, p.views)) - Math.log(floor)) / span) * 100)}%`, "--d": `${i * 28}ms` } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

function AccountCard({
  card,
  index,
  selected,
  en,
  onSelect,
  onRetry,
  onDismiss,
}: {
  card: CardState;
  index: number;
  selected: boolean;
  en: boolean;
  onSelect: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  const done = card.status === "done" ? card.account : null;
  const identity: { name: string; handle: string; avatar: string; followers: number } = card.status === "done" ? card.account : card;
  const level = done ? done.level : null;
  const median = done ? done.report.rounds.medianViews : 0;
  const source = card.status === "done" ? card.account.source : card.source;
  const lookup = source === "lookup";
  const errorCopy =
    card.status === "error" && card.error === "timeout"
      ? t("L'analyse a été trop longue. Réessaie.", "The analysis took too long. Try again.", en)
      : card.status === "error" && card.error === "private_or_empty"
      ? t("Compte privé ou sans post public.", "Private account or no public posts.", en)
      : card.status === "error" && card.error === "unavailable"
        ? t("Les posts n'ont pas pu être récupérés.", "Posts could not be fetched.", en)
        : t("TikTok n'a pas répondu pour ce compte.", "TikTok did not answer for this account.", en);

  return (
    <Beam active={selected} size="md" colorVariant={level === "likely" ? "sunset" : level === "mild" ? "sunset" : "mono"} strength={0.7} className="ss-sb-card__beam">
    <article
      className={`ss-sb-card ${card.status} ${selected ? "is-selected" : ""} ${lookup ? "is-lookup" : ""}`}
      style={{ "--i": index } as React.CSSProperties}
      data-level={level || ""}
    >
      <button type="button" className="ss-sb-card__hit" onClick={onSelect} disabled={card.status !== "done"} aria-pressed={selected}>
        <header className="ss-sb-card__who">
          <Avatar src={identity.avatar} name={identity.name} />
          <div>
            <b>{identity.name}</b>
            <span>
              @{identity.handle}
              {identity.followers ? ` · ${compact(identity.followers, en)} ${t("abonnés", "followers", en)}` : ""}
            </span>
          </div>
          {lookup ? (
            <em className="ss-sb-chip ss-sb-chip--ext">{t("Vérification", "Lookup", en)}</em>
          ) : source === "connected" ? (
            <em className="ss-sb-chip ss-sb-chip--own">{t("Connecté", "Connected", en)}</em>
          ) : null}
        </header>

        <div className="ss-sb-card__score">
          <Indicator level={level} pending={card.status !== "done"} />
          <div className="ss-sb-card__verdict">
            {card.status === "loading" ? (
              <>
                <em className="ss-sb-chip is-pulse">{t("Analyse en cours", "Analyzing", en)}</em>
                <p>{t("Lecture des 30 derniers posts…", "Reading the last 30 posts…", en)}</p>
              </>
            ) : card.status === "error" ? (
              <>
                <em className="ss-sb-chip" data-level="mild">
                  {t("Analyse impossible", "Could not analyze", en)}
                </em>
                <p>{errorCopy}</p>
              </>
            ) : (
              <>
                <em className="ss-sb-chip" data-level={level || "none"}>
                  {en ? LEVEL_COPY[level || "none"].en : LEVEL_COPY[level || "none"].fr}
                </em>
                <p>{reasonOf(done!, en)}</p>
              </>
            )}
          </div>
        </div>

        {done && level !== "insufficient" ? (
          <>
            <Sparkline account={done} />
            <dl className="ss-sb-card__stats">
              <div>
                <dt>{t("Médiane (vues)", "Median (views)", en)}</dt>
                <dd>{compact(median, en)}</dd>
              </div>
              <div>
                <dt>{t("Variation normale", "Normal swing", en)}</dt>
                <dd>{fmtSwing(done.report.swingFactor, en)}</dd>
              </div>
              <div>
                <dt>{t("Écart à sa normale", "Gap to its normal", en)}</dt>
                <dd>{fmtSigma(done.report.zScore, en)}</dd>
              </div>
            </dl>
          </>
        ) : card.status === "loading" ? (
          <div className="ss-sb-card__skeleton">
            <i />
            <i />
            <i />
          </div>
        ) : null}
      </button>

      {card.status === "error" && onRetry ? (
        <button type="button" className="ss-btn-ghost ss-sb-card__retry" onClick={onRetry}>
          {t("Réessayer", "Retry", en)}
        </button>
      ) : null}
      {onDismiss ? (
        <button type="button" className="ss-sb-card__close lg lg--lens lg-press" onClick={onDismiss} aria-label={t("Retirer", "Remove", en)}>
          <IconX />
        </button>
      ) : null}
    </article>
    </Beam>
  );
}

const LOOKUP_ERRORS: Record<string, { fr: string; en: string }> = {
  invalid_handle: { fr: "Entre un @handle TikTok ou un lien de profil.", en: "Enter a TikTok @handle or a profile link." },
  not_found: { fr: "Ce compte TikTok n'existe pas.", en: "This TikTok account does not exist." },
  private_or_empty: { fr: "Compte privé ou sans post public : rien à analyser.", en: "Private account or no public posts: nothing to analyze." },
  unavailable: { fr: "La vérification externe est indisponible pour le moment.", en: "External lookup is unavailable right now." },
};

export function ShadowbanView() {
  const { channels, english: en } = useStudio();
  const [library, setLibrary] = useState<Account[]>([]);
  useEffect(() => {
    let live = true;
    fetch("/api/accounts")
      .then((res) => res.json())
      .then((json) => live && setLibrary(json.accounts || []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // Connected accounts first, then the library accounts added by handle.
  const targets = useMemo<Identity[]>(
    () => [
      ...channels
        .filter((c) => c.platform === "tiktok" && c.connected)
        .map((c) => ({ key: `ch:${c.id}`, handle: c.handle, name: c.name || c.handle, avatar: c.avatar || "", followers: c.followers || 0, source: "connected" as const })),
      ...library.map((a) => ({ key: `ac:${a.id}`, handle: a.handle, name: a.nickname || a.handle, avatar: a.avatar || "", followers: a.followers || 0, source: "library" as const })),
    ],
    [channels, library],
  );

  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [lookups, setLookups] = useState<CardState[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [runId, setRunId] = useState(0);
  // One generation per account: a stale response (re-run, unmount) is ignored
  // instead of aborted, so nothing ever rejects into the dev overlay.
  const generation = useRef<Map<string, number>>(new Map());
  const detailRef = useRef<HTMLDivElement>(null);

  const analyze = useCallback((target: Identity) => {
    const gen = (generation.current.get(target.key) || 0) + 1;
    generation.current.set(target.key, gen);
    const fresh = () => generation.current.get(target.key) === gen;
    setCards((prev) => ({ ...prev, [target.key]: { ...target, status: "loading" } }));
    // Une requête qui ne revient jamais laisserait la carte tourner sans fin, et
    // « Relancer » reste désactivé tant qu'une analyse est en cours : au-delà de
    // deux minutes on rend la main avec un bouton Réessayer.
    const timeout = window.setTimeout(() => {
      if (!fresh()) return;
      generation.current.set(target.key, gen + 1);
      setCards((prev) => ({ ...prev, [target.key]: { ...target, status: "error", error: "timeout" } }));
    }, 120_000);
    fetch(`/api/tiktok/shadowban?key=${encodeURIComponent(target.key)}`)
      .then(async (res) => {
        window.clearTimeout(timeout);
        const json = await res.json().catch(() => ({}));
        const account = json.accounts?.[0];
        if (!res.ok || !account || account.error) throw new Error(account?.error || json.error || "shadowban_failed");
        if (fresh()) setCards((prev) => ({ ...prev, [target.key]: { key: target.key, status: "done", account } }));
      })
      .catch((error) => {
        window.clearTimeout(timeout);
        if (fresh()) setCards((prev) => ({ ...prev, [target.key]: { ...target, status: "error", error: error instanceof Error ? error.message : "shadowban_failed" } }));
      });
  }, []);

  // Landing on the page starts every account's analysis at once; accounts
  // that appear later (library list arriving) start theirs on arrival.
  // Un compte n'est analysé qu'une fois par exécution : la liste de la
  // bibliothèque arrive après les comptes connectés, et ce second rendu ne doit
  // pas périmer l'analyse déjà en vol — sinon sa réponse est ignorée et la carte
  // reste sur « Analyse en cours » indéfiniment.
  const startedRun = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const runs = startedRun.current;
    targets.forEach((tg) => {
      if (runs.get(tg.key) === runId) return;
      runs.set(tg.key, runId);
      analyze(tg);
    });
  }, [targets, analyze, runId]);

  // Seul le démontage périme les réponses encore en vol.
  useEffect(() => {
    const gens = generation.current;
    return () => gens.forEach((value, key) => gens.set(key, value + 1));
  }, []);

  const ordered: CardState[] = useMemo(
    () => targets.map((tg) => cards[tg.key]).filter((c): c is CardState => Boolean(c)),
    [targets, cards],
  );
  const all = useMemo(() => [...lookups, ...ordered], [lookups, ordered]);
  const current = useMemo(() => {
    const found = all.find((c) => c.key === selected);
    return found?.status === "done" ? found.account : null;
  }, [all, selected]);

  const summary = useMemo(() => {
    const done = ordered.filter((c): c is Extract<CardState, { status: "done" }> => c.status === "done");
    const pending = ordered.filter((c) => c.status === "loading").length;
    const likely = done.filter((c) => c.account.level === "likely").length;
    const mild = done.filter((c) => c.account.level === "mild").length;
    const healthy = done.filter((c) => c.account.level === "none").length;
    const failed = ordered.filter((c) => c.status === "error").length;
    return { pending, likely, mild, healthy, failed, total: ordered.length };
  }, [ordered]);

  const select = useCallback((key: string) => {
    setSelected((prev) => (prev === key ? null : key));
  }, []);

  useEffect(() => {
    if (!current || !detailRef.current) return;
    const id = window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" }), 60);
    return () => window.clearTimeout(id);
  }, [current]);

  const submit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const handle = query.trim();
      if (!handle || searching) return;
      setSearching(true);
      setSearchError("");
      try {
        const res = await fetch("/api/tiktok/shadowban", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.account) throw new Error(json.error || "lookup_failed");
        const account = json.account as ShadowbanAccount;
        setLookups((prev) => [{ key: account.key, status: "done", account }, ...prev.filter((c) => c.key !== account.key)]);
        setSelected(account.key);
        setQuery("");
      } catch (error) {
        const code = error instanceof Error ? error.message : "lookup_failed";
        const copy = LOOKUP_ERRORS[code] || LOOKUP_ERRORS.unavailable;
        setSearchError(en ? copy.en : copy.fr);
      } finally {
        setSearching(false);
      }
    },
    [query, searching, en],
  );

  const dismissLookup = useCallback((key: string) => {
    setLookups((prev) => prev.filter((c) => c.key !== key));
    setSelected((prev) => (prev === key ? null : prev));
  }, []);

  const summaryLine = (() => {
    if (!summary.total) return t("Analyse n'importe quel compte TikTok, connecté ou non.", "Analyze any TikTok account, connected or not.", en);
    if (summary.pending) return t(`Analyse de ${summary.total} compte${summary.total > 1 ? "s" : ""}…`, `Analyzing ${summary.total} account${summary.total > 1 ? "s" : ""}…`, en);
    if (summary.likely) return t(`${summary.likely} compte${summary.likely > 1 ? "s" : ""} shadowban.`, `${summary.likely} account${summary.likely > 1 ? "s" : ""} shadowbanned.`, en);
    if (summary.mild) return t(`${summary.mild} compte${summary.mild > 1 ? "s" : ""} à surveiller, aucun shadowban.`, `${summary.mild} account${summary.mild > 1 ? "s" : ""} to watch, no shadowban.`, en);
    if (summary.failed && !summary.healthy) return t(`${summary.failed} compte${summary.failed > 1 ? "s" : ""} non analysé${summary.failed > 1 ? "s" : ""}.`, `${summary.failed} account${summary.failed > 1 ? "s" : ""} not analyzed.`, en);
    if (summary.failed) return t(`${summary.healthy} sain${summary.healthy > 1 ? "s" : ""}, ${summary.failed} non analysé${summary.failed > 1 ? "s" : ""}.`, `${summary.healthy} healthy, ${summary.failed} not analyzed.`, en);
    return t("Aucun risque sur tes comptes.", "No risk on your accounts.", en);
  })();

  return (
    <div className="ss-sb ss-page-enter">
      <div className="ss-sb__bar">
        <div className="ss-sb__title">
          <h1>Shadowban</h1>
          <p key={summaryLine} className="ss-sb__summary">{summaryLine}</p>
        </div>
        <form className={`ss-sb__search lg lg--lens ${searching ? "is-busy" : ""}`} onSubmit={submit} role="search">
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
            <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M13.5 13.5 17 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (searchError) setSearchError("");
            }}
            placeholder={t("Vérifier un autre compte : @handle ou lien", "Check another account: @handle or link", en)}
            autoComplete="off"
            spellCheck={false}
            aria-label={t("Compte TikTok à vérifier", "TikTok account to check", en)}
          />
          <Metal preset="silver" strength={searching ? 1 : 0.7}>
            <button type="submit" className="ss-btn-purple lg-press" disabled={!query.trim() || searching}>
              {searching ? <Orb size={20} state="searching" invert /> : null}
              {searching ? t("Analyse…", "Checking…", en) : t("Vérifier", "Check", en)}
            </button>
          </Metal>
        </form>
        {searchError ? (
          <p className="ss-sb__error ss-flash-in" role="alert">
            {searchError}
          </p>
        ) : null}
      </div>

      <div className="ss-sb__body">
        {!targets.length && !lookups.length ? (
          <div className="ss-sb-empty">
            <h2>{t("Aucun compte TikTok connecté", "No TikTok account connected", en)}</h2>
            <p>
              {t(
                "Connecte tes comptes pour les analyser automatiquement à chaque visite, ou tape un @handle ci-dessus pour vérifier n'importe quel compte.",
                "Connect your accounts to analyze them automatically on every visit, or type a @handle above to check any account.",
                en,
              )}
            </p>
            <Link className="ss-btn-purple" href="/app/integrations">
              {t("Connecter TikTok", "Connect TikTok", en)}
            </Link>
          </div>
        ) : null}

        {all.length ? (
          <div className="ss-sb__grid">
            {all.map((card, i) => (
              <AccountCard
                key={card.key}
                card={card}
                index={i}
                en={en}
                selected={selected === card.key}
                onSelect={() => select(card.key)}
                onRetry={card.status === "error" ? () => { const tg = targets.find((c) => c.key === card.key); if (tg) analyze(tg); } : undefined}
                onDismiss={card.status === "done" && card.account.source === "lookup" ? () => dismissLookup(card.key) : undefined}
              />
            ))}
          </div>
        ) : null}

        {targets.length ? (
          <div className="ss-sb__actions">
            <button type="button" className="ss-btn-ghost" onClick={() => setRunId((n) => n + 1)} disabled={summary.pending > 0}>
              {t("Relancer l'analyse", "Run again", en)}
            </button>
            <span>{t("Estimation calculée sur les vraies vues. TikTok ne publie aucun statut officiel.", "Estimate computed from real views. TikTok publishes no official status.", en)}</span>
          </div>
        ) : null}

        <div ref={detailRef} className="ss-sb__detail-anchor" />
        {current ? <ShadowbanDetail key={current.key} account={current} en={en} onClose={() => setSelected(null)} /> : null}
      </div>
    </div>
  );
}
