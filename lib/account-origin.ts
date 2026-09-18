import type { Account, StoreData } from "./types";

/**
 * Un compte de la collection `accounts` est soit SUIVI expres par l'utilisateur,
 * soit une donnee du moteur de Recherche (un concurrent trouve par mot-cle).
 *
 * Les deux vivaient dans la meme liste sans rien pour les distinguer : chaque
 * recherche ajoutait ses comptes mesures a l'Overview, au calendrier, au composeur
 * et a l'agent, comme s'ils appartenaient a l'utilisateur. Mesure le 18 septembre
 * 2026 : 94 des 99 « comptes » de l'Overview venaient de recherches (« sleepmaxing »,
 * « football »...), pour 4 comptes reellement connectes.
 */
export function isResearchAccount(account: Pick<Account, "origin" | "researchCoverage">) {
  if (account.origin) return account.origin === "research";
  // Donnee anterieure au champ `origin` : une couverture de recherche ne s'ecrit
  // que par le moteur de Recherche.
  return Boolean(account.researchCoverage);
}

/** Comptes que l'utilisateur considere comme « les siens » : suivis expres, non masques. */
export function isFollowedAccount(account: Pick<Account, "origin" | "researchCoverage" | "hidden">) {
  return !account.hidden && !isResearchAccount(account);
}

/**
 * Pose `origin` sur les comptes anterieurs au champ. Un compte est une donnee de
 * recherche s'il porte une couverture, ou si sa `niche` est exactement le mot-cle
 * d'une recherche du meme utilisateur (le moteur y ecrit le mot-cle). Idempotent ;
 * a besoin de `accounts`, `researchJobs` et `runs`.
 */
export function backfillAccountOrigins(data: Pick<StoreData, "accounts" | "researchJobs" | "runs">) {
  const keywords = new Map<string, Set<string>>();
  const add = (userId: string, word: string) => {
    const clean = word.trim().toLowerCase();
    if (!clean) return;
    if (!keywords.has(userId)) keywords.set(userId, new Set());
    keywords.get(userId)!.add(clean);
  };
  for (const job of data.researchJobs || []) for (const word of job.input?.keywords || []) add(job.userId, String(word));
  for (const run of data.runs || []) for (const word of String(run.keywords || "").split(",")) add(run.userId, word);
  let research = 0, manual = 0;
  for (const account of data.accounts) {
    if (account.origin) continue;
    const fromSearch = Boolean(account.researchCoverage) || Boolean(keywords.get(account.userId)?.has((account.niche || "").trim().toLowerCase()));
    account.origin = fromSearch ? "research" : "manual";
    if (fromSearch) research += 1; else manual += 1;
  }
  return { research, manual };
}
