import { createHash } from "node:crypto";
import type { BusinessScope, BusinessTransaction, BusinessAdjustment, EntityInput } from "./model";
import { getRecord, listRecords, importRecordsAtomically } from "./repository";
import { parseCsv } from "./validation";

export const IMPORT_TEMPLATE = "external_id,occurred_at,amount_minor,currency,tax_minor,kind,customer_ref,publication_id,refund_of\norder-001,2026-09-13T12:00:00Z,2900,EUR,483,one_time,,,\n";
type ImportRow = { externalId: string; occurredAt: string; amountMinor: number; currency: string; taxMinor: number | null; kind: BusinessTransaction["kind"]; customerId?: string; publicationId?: string; refundOf?: string };
export async function importBusinessCsv(scope: BusinessScope, csv: string, dryRun: boolean) {
  const parsed = parseCsv(csv);
  if (parsed.length < 2) return { valid: false, rows: [], errors: [{ row: 1, message: "csv_empty" }], imported: 0, skipped: 0 };
  const [headers, ...records] = parsed; const columns = headers.map(x => x.trim().toLowerCase());
  const allowed = ["external_id", "occurred_at", "amount_minor", "currency", "tax_minor", "kind", "customer_ref", "publication_id", "refund_of"];
  if (new Set(columns).size !== columns.length || columns.some(c => !allowed.includes(c)) || ["external_id", "occurred_at", "amount_minor", "currency"].some(c => !columns.includes(c))) throw new Error("invalid_csv_headers");
  const rows: ImportRow[] = [], errors: { row: number; message: string }[] = []; const ids = new Set<string>();
  const publications = new Set((await listRecords(scope, "publications", { limit: 10000 })).map(p => p.id));
  const integer = (v: string) => /^\d+$/.test(v) && Number.isSafeInteger(Number(v)) && Number(v) <= 1_000_000_000_000;
  for (const [i, values] of records.entries()) {
    const row = Object.fromEntries(columns.map((c, j) => [c, (values[j] || "").trim()]));
    let message = "";
    if (values.length !== columns.length) message = "csv_column_count";
    else if (!row.external_id || row.external_id.length > 180 || ids.has(row.external_id)) message = "csv_duplicate_or_missing_id";
    else if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(row.occurred_at) || !Number.isFinite(Date.parse(row.occurred_at)) || Date.parse(row.occurred_at) > Date.now() + 60000) message = "csv_invalid_date";
    else if (!integer(row.amount_minor) || row.tax_minor && (!integer(row.tax_minor) || Number(row.tax_minor) > Number(row.amount_minor))) message = "csv_invalid_minor_units";
    else if (!/^[A-Z]{3}$/.test(row.currency)) message = "csv_invalid_currency";
    else if (row.kind && !["initial", "renewal", "one_time", "unknown"].includes(row.kind)) message = "csv_invalid_kind";
    else if (row.publication_id && !publications.has(row.publication_id)) message = "foreign_publication";
    else if (row.customer_ref?.length > 180 || row.refund_of?.length > 180) message = "csv_invalid_reference";
    if (message) { errors.push({ row: i + 2, message }); continue; }
    ids.add(row.external_id);
    rows.push({ externalId: row.external_id, occurredAt: new Date(row.occurred_at).toISOString(), amountMinor: Number(row.amount_minor), currency: row.currency, taxMinor: row.tax_minor ? Number(row.tax_minor) : null, kind: row.kind as ImportRow["kind"] || "unknown", customerId: row.customer_ref || undefined, publicationId: row.publication_id || undefined, refundOf: row.refund_of || undefined });
  }
  const idFor = (id: string) => "import_" + createHash("sha256").update(`${scope.userId}:${scope.projectId}:${id}`).digest("hex").slice(0, 32);
  const existingAdjustments = await listRecords(scope, "adjustments", { limit: 10001 });
  if (existingAdjustments.length > 10000) throw new Error("csv_existing_history_limit");
  const batchRefunds = new Map<string, { amount: number; tax: number; ids: Set<string> }>();
  for (const [i, row] of rows.entries()) if (row.refundOf) {
    const original = await getRecord(scope, "transactions", idFor(row.refundOf)) || rows.find(r => !r.refundOf && r.externalId === row.refundOf);
    if (!original || original.currency !== row.currency || row.amountMinor > original.amountMinor || Date.parse(row.occurredAt) < Date.parse(original.occurredAt)) { errors.push({ row: i + 2, message: "csv_invalid_refund_reference" }); continue; }
    let cumulative = batchRefunds.get(row.refundOf);
    if (!cumulative) {
      const prior = existingAdjustments.filter(a => a.transactionId === idFor(row.refundOf!));
      cumulative = { amount: prior.reduce((n, a) => n + a.amountMinor * (a.kind === "reversal" ? -1 : 1), 0), tax: prior.reduce((n, a) => n + (a.taxMinor || 0) * (a.kind === "reversal" ? -1 : 1), 0), ids: new Set(prior.map(a => a.id)) };
      batchRefunds.set(row.refundOf, cumulative);
    }
    if (!cumulative.ids.has(idFor("refund:" + row.externalId))) { cumulative.amount += row.amountMinor; cumulative.tax += row.taxMinor || 0; cumulative.ids.add(idFor("refund:" + row.externalId)); }
    if (cumulative.amount > original.amountMinor || original.taxMinor != null && cumulative.tax > original.taxMinor) errors.push({ row: i + 2, message: "csv_refunds_exceed_payment" });
  }
  const preview = rows.map(({ customerId: _customer, ...row }) => row);
  if (dryRun || errors.length) return { valid: errors.length === 0, rows: preview, errors, imported: 0, skipped: 0 };
  const transactions: EntityInput<BusinessTransaction>[] = rows.filter(row => !row.refundOf).map(row => ({
    id: idFor(row.externalId), provider: "manual", externalAccountId: "csv", environment: "live", externalId: row.externalId,
    customerId: row.customerId, amountMinor: row.amountMinor, taxMinor: row.taxMinor, currency: row.currency,
    kind: row.kind, status: "paid", source: "import", occurredAt: row.occurredAt, publicationId: row.publicationId,
    attributionModel: row.publicationId ? "manual_import" : undefined, acquisitionKnown: false,
  }));
  const adjustments: EntityInput<BusinessAdjustment>[] = rows.filter(row => row.refundOf).map(row => ({
    id: idFor("refund:" + row.externalId), transactionId: idFor(row.refundOf!), provider: "manual", externalId: row.externalId,
    kind: "refund", amountMinor: row.amountMinor, taxMinor: row.taxMinor, currency: row.currency, occurredAt: row.occurredAt, source: "import",
  }));
  // Preview reads are advisory. Identity, references and aggregate refund ceilings are rechecked under one project lock at commit.
  const counts = await importRecordsAtomically(scope, { transactions, adjustments });
  return { valid: true, rows: preview, errors, ...counts };
}
