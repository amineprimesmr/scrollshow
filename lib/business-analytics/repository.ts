import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import lockfile from "proper-lockfile";
import { and, eq, desc, or, sql, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { database, databaseEnabled } from "../database";
import { businessProjects, businessDeletedUsers, businessTables } from "./schema";
import { assertShopifyPrivacyWrite } from "./shopify-privacy-rules";
import { assertBusinessConnectionNoOverlap } from "./monetary-source-rules";
import type { TransactionSql } from "postgres";
import type { BusinessScope, BusinessCollection, BusinessRecords, BusinessSnapshot, EntityInput, OwnedEntity, BusinessConnection, BusinessTransaction, PublicBusinessConnection, BusinessSettings } from "./model";

export const BUSINESS_COLLECTIONS = Object.keys(businessTables) as BusinessCollection[];
const SNAPSHOT_LIMIT = 10000;
const MAX_RECORD_BYTES = 32000;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function assertScope(scope: BusinessScope) {
  if (!scope?.userId || !scope?.projectId || scope.userId.length > 200 || scope.projectId.length > 250) throw new Error("business_scope_required");
}
function assertCollection(key: BusinessCollection) { if (!BUSINESS_COLLECTIONS.includes(key)) throw new Error("business_collection_invalid"); }
function localDir() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) throw new Error("business_database_required");
  return process.env.BUSINESS_ANALYTICS_DATA_DIR || path.join(process.env.SCROLLSHOW_DATA_DIR || path.join(process.cwd(), ".data"), "business-analytics");
}
function scopePath(scope: BusinessScope) { return path.join(localDir(), `${digest(`${scope.userId}\0${scope.projectId}`)}.json`); }
const tableFor = (key: BusinessCollection): typeof businessTables.connections => businessTables[key];
const scopeWhere = (key: BusinessCollection, scope: BusinessScope) => and(eq(businessTables[key].userId, scope.userId), eq(businessTables[key].projectId, scope.projectId));
export type LocalBusinessData = { [K in BusinessCollection]: BusinessRecords[K][] } & { deleted?: boolean };
type LocalData = LocalBusinessData;
function empty(): LocalData { return Object.fromEntries(BUSINESS_COLLECTIONS.map(k => [k, []])) as unknown as LocalData; }
async function readLocal(scope: BusinessScope): Promise<LocalData> {
  try { return { ...empty(), ...JSON.parse(await readFile(scopePath(scope), "utf8")) }; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return empty(); throw e; }
}
async function withLocalUserLock<T>(userId:string, fn:()=>Promise<T>):Promise<T> {
  const directory=localDir();await mkdir(directory,{recursive:true});
  const target=path.join(directory,`.user-${digest(userId)}`);
  await writeFile(target,"",{flag:"wx",mode:0o600}).catch(e=>{if(e.code!=="EEXIST")throw e;});
  const release=await lockfile.lock(target,{stale:120000,retries:{retries:100,minTimeout:10,maxTimeout:100}});
  try{return await fn();}finally{await release();}
}
async function userDeletedLocally(userId:string) {try{await readFile(path.join(localDir(),`.deleted-user-${digest(userId)}`));return true;}catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return false;throw e;}}
async function mutateLocal<T>(scope: BusinessScope, fn: (data: LocalData) => T | Promise<T>, allowDeleted=false): Promise<T> {
  return withLocalUserLock(scope.userId,async()=>{
    if(!allowDeleted && await userDeletedLocally(scope.userId))throw new Error("business_user_deleted");
    const target=scopePath(scope);const data=await readLocal(scope);
    if(!allowDeleted && data.deleted)throw new Error("business_project_deleted");
    const result=await fn(data);const temp=`${target}.${randomUUID()}.tmp`;
    await writeFile(temp,JSON.stringify(data),{mode:0o600});await rename(temp,target);return result;
  });
}
function naturalKey(key: BusinessCollection, input: Record<string, unknown>, id: string) {
  let bits: unknown[];
  switch (key) {
    case "connections": bits = [input.provider, input.externalAccountId, input.environment]; break;
    case "transactions": bits = [input.provider, input.externalAccountId, input.environment, input.externalId]; break;
    case "adjustments": bits = [input.provider, input.transactionId, input.externalId]; break;
    case "publications": bits = input.externalId ? [input.channelId || "", input.externalId] : [id]; break;
    case "identities": bits = [input.provider, input.externalId]; break;
    case "events": bits = input.externalId ? [input.source, input.kind, input.externalId] : [id]; break;
    case "settings": bits = ["singleton"]; break;
    default: bits = [id];
  }
  return digest(JSON.stringify(bits));
}
function lookupKey(key: BusinessCollection, input: Record<string, unknown>): string | null {
  if (key === "links") return typeof input.slug === "string" ? input.slug : null;
  if (key === "settings") return typeof input.bioSlug === "string" && input.bioSlug ? input.bioSlug : null;
  if (key === "trackingKeys") return typeof input.hash === "string" ? input.hash : null;
  return null;
}
function validateRecord(key: BusinessCollection, input: Record<string, unknown>) {
  if (JSON.stringify(input).length > MAX_RECORD_BYTES) throw new Error("business_record_too_large");
  for (const name of ["amountMinor", "taxMinor", "feeMinor", "refundedAmountMinor", "refundedTaxMinor"] as const) {
    const value = input[name]; if (value !== undefined && value !== null && (!Number.isSafeInteger(value) || Number(value) < 0)) throw new Error("business_amount_invalid");
  }
  if (typeof input.taxMinor === "number" && typeof input.amountMinor === "number" && input.taxMinor > input.amountMinor) throw new Error("business_tax_invalid");
  if (input.currency !== undefined && !/^[A-Z]{3}$/.test(String(input.currency))) throw new Error("business_currency_invalid");
  for (const name of ["occurredAt", "publishedAt", "incurredAt", "firstSeenAt"]) if (input[name] !== undefined && !Number.isFinite(Date.parse(String(input[name])))) throw new Error("business_date_invalid");
  if (key === "transactions" && (!input.externalId || !input.externalAccountId)) throw new Error("business_transaction_identity_required");
  if (key === "adjustments" && (!input.externalId || !input.transactionId)) throw new Error("business_adjustment_identity_required");
}
function makeRecord<K extends BusinessCollection>(scope: BusinessScope, key: K, input: EntityInput<BusinessRecords[K]>, previous?: BusinessRecords[K]): BusinessRecords[K] {
  const now = new Date().toISOString();
  if (key === "events" && previous && (input as unknown as BusinessRecords["events"]).source === "server") {
    const before = previous as BusinessRecords["events"], incoming = input as unknown as BusinessRecords["events"];
    if (before.source !== "server" || ["kind","clickId","customerId","provider","visitorId"].some(field => before[field as keyof typeof before] !== incoming[field as keyof typeof incoming])) throw new Error("business_event_identity_conflict");
    return previous;
  }
  if (key === "transactions" && (previous as BusinessTransaction | undefined)?.status === "paid" && (input as unknown as EntityInput<BusinessTransaction>).status === "pending") return previous!;
  const row = { ...previous, ...input, userId:scope.userId, projectId:scope.projectId, id: previous?.id || input.id || randomUUID(), createdAt: previous?.createdAt || input.createdAt || now, updatedAt: now } as BusinessRecords[K];
  validateRecord(key, row); return row;
}
function indexed(key: BusinessCollection, row: OwnedEntity) {
  const value = row as OwnedEntity & Record<string, unknown>;
  return { id: row.id, userId: row.userId, projectId: row.projectId, naturalKey: naturalKey(key, value, row.id), lookupKey: lookupKey(key, value),
    connectionId: typeof value.connectionId === "string" ? value.connectionId : null, currency: typeof value.currency === "string" ? value.currency : null,
    occurredAt: String(value.occurredAt || value.publishedAt || value.incurredAt || value.firstSeenAt || row.createdAt),
    createdAt: row.createdAt, updatedAt: row.updatedAt, data: row };
}

export async function listRecords<K extends BusinessCollection>(scope: BusinessScope, key: K, options: { limit?: number; offset?: number } = {}): Promise<BusinessRecords[K][]> {
  assertScope(scope); assertCollection(key); const limit = Math.max(1, Math.min(SNAPSHOT_LIMIT + 1, options.limit || 500)); const offset = Math.max(0, options.offset || 0);
  if (!databaseEnabled()) return (await readLocal(scope))[key].filter(r => r.userId === scope.userId && r.projectId === scope.projectId).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)).slice(offset, offset + limit) as BusinessRecords[K][];
  const table = tableFor(key); const rows = await drizzle(database()).select({ data: table.data }).from(table).where(scopeWhere(key, scope)).orderBy(desc(table.createdAt), table.id).limit(limit).offset(offset);
  return rows.map(r => r.data as BusinessRecords[K]);
}
export async function getRecord<K extends BusinessCollection>(scope: BusinessScope, key: K, id: string): Promise<BusinessRecords[K] | null> {
  assertScope(scope); assertCollection(key);
  if (!databaseEnabled()) return (await readLocal(scope))[key].find(r => r.id === id && r.userId === scope.userId && r.projectId === scope.projectId) as BusinessRecords[K] || null;
  const table = tableFor(key); const rows = await drizzle(database()).select({ data: table.data }).from(table).where(and(scopeWhere(key, scope), eq(table.id, id))).limit(1); return rows[0]?.data as BusinessRecords[K] || null;
}
export async function saveRecord<K extends BusinessCollection>(scope: BusinessScope, key: K, input: EntityInput<BusinessRecords[K]>): Promise<BusinessRecords[K]> {
  assertScope(scope); assertCollection(key); validateRecord(key, input as Record<string, unknown>);
  const proposedId = input.id || randomUUID(); const nk = naturalKey(key, input as Record<string, unknown>, proposedId);
  if (!databaseEnabled()) return mutateLocal(scope, async data => {
    await assertShopifyPrivacyWrite(key,input,async(collection,id)=>data[collection].find(row=>row.id===id)||null);
    const rows = data[key] as BusinessRecords[K][];
    const existing = rows.find(r => r.id === proposedId || naturalKey(key, r as OwnedEntity & Record<string, unknown>, r.id) === nk);
    const row = makeRecord(scope, key, { ...input, id: proposedId }, existing);
    if(key==="connections")assertBusinessConnectionNoOverlap(row as BusinessConnection,data.connections);
    const lk = lookupKey(key, row as OwnedEntity & Record<string, unknown>);
    if (lk && rows.some(r => r.id !== row.id && lookupKey(key, r as OwnedEntity & Record<string, unknown>) === lk)) throw new Error("business_lookup_conflict");
    if (existing) rows[rows.indexOf(existing)] = row; else rows.push(row); return row;
  });
  return drizzle(database()).transaction(async tx => {
    // Shared user fence permits parallel projects; deletion takes its exclusive counterpart.
    await tx.execute(sql`select pg_advisory_xact_lock_shared(hashtextextended(${`ss-business-user:${scope.userId}`}, 0))`);
    if((await tx.select().from(businessDeletedUsers).where(eq(businessDeletedUsers.userId,scope.userId)).limit(1)).length)throw new Error("business_user_deleted");
    await tx.insert(businessProjects).values(scope).onConflictDoNothing();
    const projects=await tx.select().from(businessProjects).where(and(eq(businessProjects.userId, scope.userId), eq(businessProjects.projectId, scope.projectId))).for("update");
    if(projects[0]?.deletedAt)throw new Error("business_project_deleted");
    await assertShopifyPrivacyWrite(key,input,async(collection,id)=>{
      const t=tableFor(collection);return (await tx.select({data:t.data}).from(t).where(and(scopeWhere(collection,scope),eq(t.id,id))).limit(1))[0]?.data||null;
    });
    const table = tableFor(key);
    const existing = await tx.select({ data: table.data }).from(table).where(and(scopeWhere(key, scope), or(eq(table.id, proposedId), eq(table.naturalKey, nk)))).limit(1);
    const row = makeRecord(scope, key, { ...input, id: proposedId }, existing[0]?.data as BusinessRecords[K] | undefined);
    if(key==="connections"){
      const c=businessTables.connections,connections=await tx.select({data:c.data}).from(c).where(scopeWhere("connections",scope));
      assertBusinessConnectionNoOverlap(row as BusinessConnection,connections.map(item=>item.data as BusinessConnection));
    }
    const values = indexed(key, row);
    await tx.insert(table).values(values).onConflictDoUpdate({ target: [table.userId, table.projectId, table.id], set: values }); return row;
  });
}
export async function deleteRecord(scope: BusinessScope, key: BusinessCollection, id: string): Promise<boolean> {
  assertScope(scope); assertCollection(key);
  if (!databaseEnabled()) return mutateLocal(scope, data => { const index = data[key].findIndex(r => r.id === id); if (index < 0) return false; data[key].splice(index,1); return true; });
  const table = tableFor(key); return (await drizzle(database()).delete(table).where(and(scopeWhere(key, scope), eq(table.id, id))).returning({ id: table.id })).length > 0;
}
export async function readProject(scope: BusinessScope): Promise<BusinessSnapshot> {
  const truncated: BusinessCollection[] = []; const pairs = await Promise.all(BUSINESS_COLLECTIONS.map(async key => {
    const rows = await listRecords(scope, key, { limit: SNAPSHOT_LIMIT + 1 }); if (rows.length > SNAPSHOT_LIMIT) truncated.push(key); return [key, rows.slice(0, SNAPSHOT_LIMIT)];
  })); return { ...Object.fromEntries(pairs), scope, truncated, loadedAt: new Date().toISOString() } as BusinessSnapshot;
}
export const readBusinessSnapshot = readProject;
async function lookup<K extends BusinessCollection>(key: K, value: string, byId = false): Promise<BusinessRecords[K] | null> {
  if (!value || value.length > 300) return null;
  if (databaseEnabled()) { const t = tableFor(key); const rows = await drizzle(database()).select({ data: t.data }).from(t).where(eq(byId ? t.id : t.lookupKey, value)).limit(2); return rows.length === 1 ? rows[0].data as BusinessRecords[K] : null; }
  const directory = localDir(); const files = await readdir(directory).catch(e => { if (e.code === "ENOENT") return []; throw e; }); let found: BusinessRecords[K] | null = null;
  for (const file of files.filter(f => f.endsWith(".json"))) { const data = JSON.parse(await readFile(path.join(directory,file),"utf8")) as LocalData;
    for (const row of data[key] || []) if ((byId ? row.id : lookupKey(key, row as OwnedEntity & Record<string, unknown>)) === value) { if (found) return null; found = row as BusinessRecords[K]; }
  } return found;
}
export async function findPublicLink(slug: string) { const row = await lookup("links",slug); return row?.active ? row : null; }
export async function findPublicBio(slug: string) { const row = await lookup("settings",slug); return row?.bioEnabled ? row : null; }
export async function findByTrackingKeyHash(hash: string) { const row = await lookup("trackingKeys",hash); return row?.active ? row : null; }
/** Only webhook signature verification may use this unscoped server-secret lookup. */
export const lookupWebhookConnection = (id: string) => lookup("connections",id,true);
export async function listActiveConnections(options: { limit?: number } = {}): Promise<BusinessConnection[]> {
  const limit = Math.min(100,Math.max(1,options.limit || 20));
  if (databaseEnabled()) { const t = businessTables.connections; const rows = await drizzle(database()).select({ data: t.data }).from(t)
    .where(sql`(${t.data}->>'status' in ('connected','error') or (${t.data}->>'status' = 'syncing' and (${t.data}->>'syncLeaseUntil')::timestamptz < now()))`)
    .orderBy(sql`coalesce((${t.data}->>'lastSyncAttemptAt')::timestamptz, (${t.data}->>'lastSyncedAt')::timestamptz) asc nulls first`, t.id).limit(limit);
    return rows.map(r => r.data as BusinessConnection); }
  const directory = localDir(); const files = await readdir(directory).catch(e => { if (e.code === "ENOENT") return []; throw e; }); const rows: BusinessConnection[] = [];
  for (const file of files.filter(f => f.endsWith(".json"))) rows.push(...(JSON.parse(await readFile(path.join(directory,file),"utf8")) as LocalData).connections);
  return rows.filter(c => c.status === "connected" || c.status === "error" || (c.status === "syncing" && c.syncLeaseUntil && Date.parse(c.syncLeaseUntil)<Date.now())).sort((a,b) => (a.lastSyncAttemptAt || a.lastSyncedAt || "").localeCompare(b.lastSyncAttemptAt || b.lastSyncedAt || "")).slice(0,limit);
}
export async function findTransactionByExternalId(scope: BusinessScope, input: Pick<BusinessTransaction, "provider" | "externalAccountId" | "environment" | "externalId">) {
  assertScope(scope); const nk = naturalKey("transactions", input, "");
  if (!databaseEnabled()) return (await readLocal(scope)).transactions.find(t => naturalKey("transactions",t as BusinessTransaction & Record<string,unknown>,t.id) === nk) || null;
  const t = businessTables.transactions; const rows = await drizzle(database()).select({data:t.data}).from(t).where(and(scopeWhere("transactions",scope),eq(t.naturalKey,nk))).limit(1); return rows[0]?.data as BusinessTransaction || null;
}
async function mutateConnection(scope: BusinessScope,id: string,fn:(row:BusinessConnection)=>BusinessConnection|null):Promise<BusinessConnection|null> {
  assertScope(scope);
  if(!databaseEnabled()) return mutateLocal(scope,data=> {const at=data.connections.findIndex(c=>c.id===id); if(at<0)return null; const changed=fn(data.connections[at]); if(changed)data.connections[at]=changed; return changed;});
  return drizzle(database()).transaction(async tx=>{const t=businessTables.connections; const rows=await tx.select({data:t.data}).from(t).where(and(scopeWhere("connections",scope),eq(t.id,id))).for("update"); if(!rows.length)return null; const changed=fn(rows[0].data as BusinessConnection); if(changed)await tx.update(t).set(indexed("connections",changed)).where(and(scopeWhere("connections",scope),eq(t.id,id))); return changed;});
}
export async function claimConnectionSync(scope:BusinessScope,id:string,ttlMs=180000) {
  return mutateConnection(scope,id,row=>{if(row.status==="disconnected" || (row.syncLeaseUntil && Date.parse(row.syncLeaseUntil)>Date.now()))return null; return {...row,status:"syncing",lastSyncAttemptAt:new Date().toISOString(),syncClaim:randomUUID(),syncLeaseUntil:new Date(Date.now()+Math.min(300000,ttlMs)).toISOString(),updatedAt:new Date().toISOString()};});
}
export async function releaseConnectionSync(scope:BusinessScope,id:string,claim:string,patch:Partial<BusinessConnection>={}) {
  return Boolean(await mutateConnection(scope,id,row=>row.syncClaim===claim?{...row,...patch,metadata:{...row.metadata,...patch.metadata},id:row.id,userId:row.userId,projectId:row.projectId,syncClaim:undefined,syncLeaseUntil:undefined,updatedAt:new Date().toISOString()}:null));
}
export async function deleteProject(scope:BusinessScope) {
  assertScope(scope);
  if(!databaseEnabled()){await mutateLocal(scope,data=>{for(const key of BUSINESS_COLLECTIONS)data[key]=[] as never;data.deleted=true;},true);return;}
  await drizzle(database()).transaction(async tx=>{
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`ss-business-user:${scope.userId}`}, 0))`);
    await tx.delete(businessProjects).where(and(eq(businessProjects.userId,scope.userId),eq(businessProjects.projectId,scope.projectId)));
    await tx.insert(businessProjects).values({...scope,deletedAt:new Date().toISOString()});
  });
}
export async function deleteUser(userId:string) {
  if(!userId)throw new Error("business_scope_required");
  if(databaseEnabled()){
    await drizzle(database()).transaction(async tx=>{
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`ss-business-user:${userId}`}, 0))`);
      await tx.insert(businessDeletedUsers).values({userId}).onConflictDoNothing();
      await tx.delete(businessProjects).where(eq(businessProjects.userId,userId));
    });return;
  }
  await withLocalUserLock(userId,async()=>{
    const directory=localDir();await writeFile(path.join(directory,`.deleted-user-${digest(userId)}`),"deleted",{mode:0o600});
    const files=await readdir(directory);
    for(const file of files.filter(f=>f.endsWith(".json"))){
      const target=path.join(directory,file);const data=JSON.parse(await readFile(target,"utf8")) as LocalData;
      if(BUSINESS_COLLECTIONS.some(k=>(data[k] as OwnedEntity[]).some(r=>r.userId===userId))){const temp=`${target}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify({...empty(),deleted:true}),{mode:0o600});await rename(temp,target);}
    }
  });
}
/** Explicit allowlist: future credential or cursor fields cannot leak through object spreading. */
export function publicConnection(c:BusinessConnection):PublicBusinessConnection {
  return {id:c.id,userId:c.userId,projectId:c.projectId,createdAt:c.createdAt,updatedAt:c.updatedAt,
    provider:c.provider,name:c.name,externalAccountId:c.externalAccountId,environment:c.environment,status:c.status,
    scopes:c.scopes,productIds:c.productIds,appIds:c.appIds,monetarySource:c.monetarySource,
    lastSyncedAt:c.lastSyncedAt,historyStartedAt:c.historyStartedAt,historyComplete:c.historyComplete,
    lastError:c.lastError,lastWebhookAt:c.lastWebhookAt,lastSyncAttemptAt:c.lastSyncAttemptAt,
    hasCredentials:Boolean(c.encryptedCredentials),hasWebhookSecret:Boolean(c.encryptedWebhookSecret)};
}
export function defaultBusinessSettings(scope:BusinessScope,now=new Date().toISOString()):BusinessSettings {return {...scope,id:`settings_${digest(`${scope.userId}\0${scope.projectId}`).slice(0,24)}`,createdAt:now,updatedAt:now,currency:"EUR",attributionWindowDays:7,horizonDays:30,bioEnabled:false,costsComplete:false};}
export const getConnection = (scope:BusinessScope,id:string)=>getRecord(scope,"connections",id);
export const listConnections = (scope:BusinessScope)=>listRecords(scope,"connections",{limit:100});
export const listTransactions = (scope:BusinessScope,options?:{limit?:number;offset?:number})=>listRecords(scope,"transactions",options);
export const saveConnection = (scope:BusinessScope,input:EntityInput<BusinessRecords["connections"]>)=>saveRecord(scope,"connections",input);
export const upsertConnection = saveConnection;
export const saveTransaction = (scope:BusinessScope,input:EntityInput<BusinessRecords["transactions"]>)=>saveRecord(scope,"transactions",input);
export const upsertTransaction = saveTransaction;
export const saveAdjustment = (scope:BusinessScope,input:EntityInput<BusinessRecords["adjustments"]>)=>saveRecord(scope,"adjustments",input);
export const savePublication = (scope:BusinessScope,input:EntityInput<BusinessRecords["publications"]>)=>saveRecord(scope,"publications",input);
export const saveLink = (scope:BusinessScope,input:EntityInput<BusinessRecords["links"]>)=>saveRecord(scope,"links",input);
export const saveClick = (scope:BusinessScope,input:EntityInput<BusinessRecords["clicks"]>)=>saveRecord(scope,"clicks",input);
export const saveIdentity = (scope:BusinessScope,input:EntityInput<BusinessRecords["identities"]>)=>saveRecord(scope,"identities",input);
export const saveEvent = (scope:BusinessScope,input:EntityInput<BusinessRecords["events"]>)=>saveRecord(scope,"events",input);
export const saveCost = (scope:BusinessScope,input:EntityInput<BusinessRecords["costs"]>)=>saveRecord(scope,"costs",input);
export const saveExperiment = (scope:BusinessScope,input:EntityInput<BusinessRecords["experiments"]>)=>saveRecord(scope,"experiments",input);
export const saveSettings = (scope:BusinessScope,input:EntityInput<BusinessRecords["settings"]>)=>saveRecord(scope,"settings",input);
export const saveTrackingKey = (scope:BusinessScope,input:EntityInput<BusinessRecords["trackingKeys"]>)=>saveRecord(scope,"trackingKeys",input);

export const defaultSettings = defaultBusinessSettings;

/** A delayed ingestion cannot restore a rotated secret or reactivate a revoked key. */
export async function touchTrackingKey(scope: BusinessScope, id: string, expectedHash: string, now = new Date().toISOString()): Promise<boolean> {
  assertScope(scope);
  if (!databaseEnabled()) return mutateLocal(scope, data => {
    const key = data.trackingKeys.find(k => k.id === id && k.hash === expectedHash && k.active);
    if (!key) return false; key.lastUsedAt = now; key.updatedAt = now; return true;
  });
  return drizzle(database()).transaction(async tx => {
    const t=businessTables.trackingKeys;
    const rows=await tx.select({data:t.data}).from(t).where(and(scopeWhere("trackingKeys",scope),eq(t.id,id))).for("update");
    const key=rows[0]?.data as BusinessRecords["trackingKeys"] | undefined;
    if(!key || key.hash!==expectedHash || !key.active)return false;
    const updated={...key,lastUsedAt:now,updatedAt:now};
    await tx.update(t).set(indexed("trackingKeys",updated)).where(and(scopeWhere("trackingKeys",scope),eq(t.id,id)));return true;
  });
}

/** Guarded field update: webhook delivery cannot resurrect a concurrently disconnected connection. */
export async function updateConnectionIfActive(scope:BusinessScope,id:string,patch:Partial<BusinessConnection>) {
  return mutateConnection(scope,id,row=>{
    if(row.status==="disconnected")return null;
    if((patch.encryptedCredentials!==undefined || patch.encryptedWebhookSecret!==undefined) && row.syncLeaseUntil && Date.parse(row.syncLeaseUntil)>Date.now())return null;
    return {...row,...patch,id:row.id,userId:row.userId,projectId:row.projectId,createdAt:row.createdAt,updatedAt:new Date().toISOString()};
  });
}

export type BusinessImportBatch = {
  transactions: EntityInput<BusinessRecords["transactions"]>[];
  adjustments: EntityInput<BusinessRecords["adjustments"]>[];
};
function prepareImport(scope:BusinessScope,batch:BusinessImportBatch,existingPayments:BusinessTransaction[],existingAdjustments:BusinessRecords["adjustments"][]) {
  const payments=[...existingPayments],adjustments=[...existingAdjustments];
  const newPayments:BusinessTransaction[]=[],newAdjustments:BusinessRecords["adjustments"][]=[];
  let skipped=0;
  const same=(a:Record<string,unknown>,b:Record<string,unknown>,fields:string[])=>fields.every(key=>(a[key]??null)===(b[key]??null));
  for(const input of batch.transactions){
    validateRecord("transactions",input as Record<string,unknown>);
    if(input.source!=="import"||input.provider!=="manual"||input.environment!=="live"||input.status!=="paid")throw new Error("csv_invalid_payment_source");
    const nk=naturalKey("transactions",input as Record<string,unknown>,input.id||"");
    const existing=payments.find(p=>p.id===input.id||naturalKey("transactions",p as BusinessTransaction&Record<string,unknown>,p.id)===nk);
    if(existing){
      if(!same(existing as BusinessTransaction&Record<string,unknown>,input as Record<string,unknown>,["provider","externalAccountId","environment","externalId","status","kind","amountMinor","taxMinor","currency","occurredAt","customerId","publicationId","attributionModel","source"]))throw new Error("csv_existing_payment_conflict");
      skipped++;continue;
    }
    const row=makeRecord(scope,"transactions",input);payments.push(row);newPayments.push(row);
  }
  const touched=new Set<string>();
  for(const input of batch.adjustments){
    validateRecord("adjustments",input as Record<string,unknown>);
    if(input.source!=="import"||input.provider!=="manual"||input.kind!=="refund")throw new Error("csv_invalid_refund_source");
    const nk=naturalKey("adjustments",input as Record<string,unknown>,input.id||"");
    const existing=adjustments.find(a=>a.id===input.id||naturalKey("adjustments",a as BusinessRecords["adjustments"]&Record<string,unknown>,a.id)===nk);
    if(existing){
      if(!same(existing as BusinessRecords["adjustments"]&Record<string,unknown>,input as Record<string,unknown>,["provider","externalId","transactionId","kind","amountMinor","taxMinor","currency","occurredAt","source"]))throw new Error("csv_existing_refund_conflict");
      skipped++;continue;
    }
    const parent=payments.find(p=>p.id===input.transactionId);
    if(!parent||parent.provider!=="manual"||parent.status!=="paid"||parent.currency!==input.currency||Date.parse(input.occurredAt)<Date.parse(parent.occurredAt))throw new Error("csv_invalid_refund_reference");
    const row=makeRecord(scope,"adjustments",input);adjustments.push(row);newAdjustments.push(row);touched.add(parent.id);
  }
  for(const id of touched){
    const parent=payments.find(p=>p.id===id)!;const rows=adjustments.filter(a=>a.transactionId===id);
    const gross=rows.reduce((sum,a)=>sum+a.amountMinor*(a.kind==="reversal"?-1:1),0);
    const knownTax=rows.reduce((sum,a)=>sum+(a.taxMinor||0)*(a.kind==="reversal"?-1:1),0);
    if(gross>parent.amountMinor||gross<0||!Number.isSafeInteger(gross))throw new Error("csv_refunds_exceed_payment");
    if(parent.taxMinor!==null && (knownTax>parent.taxMinor||knownTax<0))throw new Error("csv_refund_tax_exceeds_payment");
    if(parent.taxMinor!==null && rows.every(a=>a.taxMinor!==null) && gross-knownTax>parent.amountMinor-parent.taxMinor)throw new Error("csv_refund_net_exceeds_payment");
  }
  return {newPayments,newAdjustments,imported:newPayments.length+newAdjustments.length,skipped};
}
/** CSV apply is a transaction: preflight UI is informational, never the write-side guard. */
export async function importRecordsAtomically(scope:BusinessScope,batch:BusinessImportBatch):Promise<{imported:number;skipped:number}> {
  assertScope(scope);
  if(batch.transactions.length+batch.adjustments.length>1000)throw new Error("csv_limit_exceeded");
  if(!databaseEnabled())return mutateLocal(scope,data=>{
    const plan=prepareImport(scope,batch,data.transactions,data.adjustments);
    data.transactions.push(...plan.newPayments);data.adjustments.push(...plan.newAdjustments);return {imported:plan.imported,skipped:plan.skipped};
  });
  return drizzle(database()).transaction(async tx=>{
    await tx.execute(sql`select pg_advisory_xact_lock_shared(hashtextextended(${`ss-business-user:${scope.userId}`},0))`);
    if((await tx.select().from(businessDeletedUsers).where(eq(businessDeletedUsers.userId,scope.userId)).limit(1)).length)throw new Error("business_user_deleted");
    await tx.insert(businessProjects).values(scope).onConflictDoNothing();
    const projects=await tx.select().from(businessProjects).where(and(eq(businessProjects.userId,scope.userId),eq(businessProjects.projectId,scope.projectId))).for("update");
    if(projects[0]?.deletedAt)throw new Error("business_project_deleted");
    const paymentIds=[...new Set([...batch.transactions.flatMap(t=>t.id?[t.id]:[]),...batch.adjustments.map(a=>a.transactionId)])];
    const paymentKeys=batch.transactions.map(t=>naturalKey("transactions",t as Record<string,unknown>,t.id||""));
    const p=businessTables.transactions,a=businessTables.adjustments;
    const paymentRows=paymentIds.length||paymentKeys.length?await tx.select({data:p.data}).from(p).where(and(scopeWhere("transactions",scope),or(inArray(p.id,paymentIds),inArray(p.naturalKey,paymentKeys)))):[];
    const parentIds=[...new Set([...paymentIds,...paymentRows.map(r=>r.data.id)])];
    const adjustmentIds=batch.adjustments.flatMap(a=>a.id?[a.id]:[]);
    const adjustmentRows=parentIds.length||adjustmentIds.length?await tx.select({data:a.data}).from(a).where(and(scopeWhere("adjustments",scope),or(inArray(a.id,adjustmentIds),inArray(sql<string>`${a.data}->>'transactionId'`,parentIds)))).limit(10001):[];
    if(adjustmentRows.length>10000)throw new Error("csv_import_history_limit");
    const plan=prepareImport(scope,batch,paymentRows.map(r=>r.data as BusinessTransaction),adjustmentRows.map(r=>r.data as BusinessRecords["adjustments"]));
    if(plan.newPayments.length)await tx.insert(p).values(plan.newPayments.map(row=>indexed("transactions",row)));
    if(plan.newAdjustments.length)await tx.insert(a).values(plan.newAdjustments.map(row=>indexed("adjustments",row)));
    return {imported:plan.imported,skipped:plan.skipped};
  });
}

/** Internal maintenance uses the same write/deletion fences as ingestion. No public request can supply either callback. */
export async function mutateBusinessProject<T>(scope:BusinessScope, local:(data:LocalBusinessData)=>Promise<T>|T, sqlMutation:(tx:TransactionSql)=>Promise<T>):Promise<T> {
  assertScope(scope);
  if(!databaseEnabled()) return mutateLocal(scope,local);
  const wrapped=await database().begin(async tx=>{
    await tx`SELECT pg_advisory_xact_lock_shared(hashtextextended(${`ss-business-user:${scope.userId}`},0))`;
    if((await tx`SELECT 1 FROM ss_business_deleted_users WHERE user_id=${scope.userId}`).length)throw new Error("business_user_deleted");
    const projects=await tx`SELECT deleted_at FROM ss_business_projects WHERE user_id=${scope.userId} AND project_id=${scope.projectId} FOR UPDATE`;
    if(!projects.length || projects[0].deleted_at)throw new Error("business_project_deleted");
    await tx`SET LOCAL statement_timeout = '12000ms'`;
    return {value:await sqlMutation(tx)};
  });
  return (wrapped as {value:T}).value;
}
