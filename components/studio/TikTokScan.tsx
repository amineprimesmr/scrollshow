"use client";

import "./tiktok-scan.css";

export type ScanKind = "search" | "measure";

/**
 * Indicateur de collecte en direct. Le logo TikTok au centre d'un radar qui
 * pulse dit ce que le texte seul ne dit pas : on interroge TikTok maintenant,
 * la page n'attend pas dans le vide.
 *
 * Autonome par choix : la page Recherche peut etre refondue sans le toucher.
 */
export function TikTokScan({
  kind = "search",
  target,
  size = 56,
  quiet = false,
}: {
  kind?: ScanKind;
  /** Le mot-cle cherche, ou le @compte mesure. */
  target?: string | null;
  size?: number;
  /** Sans les ondes : pour une pastille en ligne, dans une barre par exemple. */
  quiet?: boolean;
}) {
  return (
    <span
      className={`ss-scan${quiet ? " is-quiet" : ""}`}
      style={{ "--ss-scan-size": `${size}px` } as React.CSSProperties}
      data-kind={kind}
    >
      {quiet ? null : (
        <>
          <span className="ss-scan__wave" aria-hidden />
          <span className="ss-scan__wave ss-scan__wave--2" aria-hidden />
          <span className="ss-scan__wave ss-scan__wave--3" aria-hidden />
        </>
      )}
      <span className="ss-scan__disc" aria-hidden>
        <img src="/assets/platforms/tiktok.png" alt="" width={Math.round(size * 0.48)} height={Math.round(size * 0.48)} />
      </span>
      {target ? <span className="ss-scan__sr">{target}</span> : null}
    </span>
  );
}

/**
 * La ligne complete : le radar, ce qu'on interroge, et une barre de progression.
 * Le compteur ne descend jamais : il compte ce qui est deja acquis.
 */
export function TikTokScanLine({
  kind,
  target,
  done,
  total,
  fr,
  en,
  english,
  children,
}: {
  kind: ScanKind;
  target?: string | null;
  done: number;
  total: number;
  /** Le libelle deja traduit, sinon fr/en. */
  fr?: string;
  en?: string;
  english?: boolean;
  children?: React.ReactNode;
}) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const label =
    fr !== undefined && en !== undefined
      ? english
        ? en
        : fr
      : target
        ? kind === "search"
          ? english
            ? `Searching TikTok for “${target}”`
            : `On cherche « ${target} » sur TikTok`
          : english
            ? `Reading @${target}`
            : `On lit @${target}`
        : english
          ? "Connecting to TikTok"
          : "Connexion à TikTok";

  return (
    <div className="ss-scanline" aria-live="polite">
      <TikTokScan kind={kind} target={target} size={44} />
      <span className="ss-scanline__text">
        <strong>{label}</strong>
        <span className="ss-scanline__bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          <i style={{ width: `${Math.round(ratio * 100)}%` }} />
        </span>
      </span>
      {children ? <span className="ss-scanline__end">{children}</span> : null}
    </div>
  );
}
