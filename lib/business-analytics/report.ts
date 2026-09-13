import type { BusinessDashboard } from "./model";
const text = (value: string) => value.replace(/[\r\n|]/g, " ").replace(/[<>]/g, "");
export function businessReportMarkdown(data: BusinessDashboard) {
  const digits = new Intl.NumberFormat("fr", { style: "currency", currency: data.currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const money = (value: number | null) => value == null ? "Non calculable avec les données actuelles" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: data.currency }).format(value / 10 ** digits);
  const winner = [...data.formats].filter(f => f.revenuePerPostMinor !== null).sort((a, b) => b.revenuePerPostMinor! - a.revenuePerPostMinor!)[0];
  const lines = ["# Résultats du contenu", "", `Rapport généré le ${data.generatedAt}. Devise : ${data.currency}, sans conversion.`, "",
    `Période d'encaissement : ${data.period.from} → ${data.period.to}.`,
    `Cohorte de publications : ${data.cohortPeriod.from} → ${data.cohortPeriod.to}, horizon J${data.horizonDays}.`, "",
    "## Mesures", "", `- Encaissements : ${money(data.cash.grossMinor)}.`, `- Remboursements datés : ${money(data.cash.refundsMinor)}.`,
    `- Revenu après TVA et remboursements : ${money(data.cash.netRevenueMinor)}.`, `- Paiements enregistrés dans la période : ${data.cash.sales ?? "non disponible"}.`,
    `- Revenu attribué par publication éligible à J${data.horizonDays} : ${money(data.content.revenuePerPostMinor)}.`,
    `- Contribution par publication : ${money(data.content.contributionPerPostMinor)}.`, "",
    "## Couverture", "", `- Publications éligibles : ${data.content.eligiblePublications}/${data.content.totalPublications}.`,
    `- Publications encore en maturation : ${data.content.immaturePublications}.`, `- Ventes rattachées par un clic observé : ${data.coverage.attributedSalesPercent == null ? "non mesuré" : data.coverage.attributedSalesPercent + " %"}.`,
    `- Dernière collecte commerciale : ${data.coverage.lastSyncedAt || "aucune"}.`,
    "- Les ventes sans origine restent non attribuées. Un clic attribué ne prouve pas un effet causal.", "",
    "## Observations et actions", "", ...data.insights.map(i => `- **${text(i.title)}** : ${text(i.detail)}`), "",
    "## Trois prochains essais à préparer", "",
    `1. **Accroche** : ${winner ? `reprendre le format ${text(winner.format)} observé sur ${winner.publications} publications éligibles` : "choisir un contenu dont les vues sont réellement mesurées"}. Garder l'offre et l'appel à l'action constants et préparer une nouvelle accroche. Comparer à horizon identique.`,
    "2. **Appel à l'action** : rendre explicite la prochaine étape et créer un lien dédié avant publication. Mesurer les visites, inscriptions et achats effectivement reliés. Conserver le message principal.",
    "3. **Parcours de conversion** : reprendre la première étape non mesurée ou présentant une perte observée. Vérifier sa collecte avant de tester une autre page ou une autre offre. Ne pas attribuer une variation à un changement sans protocole adapté.", "",
    "Ces essais sont des hypothèses observationnelles, pas des promesses de revenu. Un agent connecté à ScrollShow peut appeler get_business_results puis create_post pour préparer les brouillons demandés. Rien n'est publié automatiquement.", "",
    "## Contenus", "", "| Publication | Horizon | Revenu attribué | Contribution | Couverture |", "|---|---:|---:|---:|---|",
    ...data.publicationOutcomes.map(p => `| ${text(p.title)} | J${data.horizonDays} | ${money(p.revenueMinor)} | ${money(p.contributionMinor)} | ${p.eligible ? "éligible" : p.exclusionReason || "non mesuré"} |`), "",
    "## Sources et méthode", "", ...data.connections.map(c => `- ${text(c.name)} (${c.provider}, ${c.environment}) : ${c.status}, historique ${c.historyComplete ? "collecté" : "partiel"}.`),
    "- Les imports et les déclarations manuelles ne sont pas des confirmations du prestataire de paiement.",
    "- Les renouvellements conservent la cohorte d'acquisition lorsqu'elle est connue. Les remboursements corrigent le contenu d'origine ; leur date sert à la vue d'encaissements.",
    "- Les taxes ou frais inconnus empêchent les métriques nettes correspondantes. Les devises ne sont jamais additionnées.", ""];
  return lines.join("\n");
}
