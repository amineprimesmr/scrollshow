import type { TransactionSql } from "postgres";
import { ConnectorError } from "./connectors/types";
import type { BusinessIdentity, BusinessScope } from "./model";
import { getRecord, listRecords, mutateBusinessProject, type LocalBusinessData } from "./repository";
import { normalizeShopifyDomain } from "./shopify-security";
import { withShopifyStoreLock } from "./shopify-store";
import { privacyHash, shopifyOrderId, shopifyPrivacyFenceId, shopifyVisitorFenceId } from "./shopify-privacy-rules";

type PrivacyTopic = "customers/data_request" | "customers/redact" | "shop/redact";
type PrivacyInput = { topic: PrivacyTopic; shopId: string; shopDomain: string; customerId: string; orderIds: string[]; requestId: string; now: string };
const FENCE_PROVIDER = "shopify-privacy-fence";
const REQUEST_PROVIDER = "shopify-privacy-request";
const requestFenceId=(requestId:string)=>`spriv_${privacyHash(`request\0${requestId}`)}`;
function id(value: unknown): string | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  return typeof value === "string" && /^\d{1,30}$/.test(value) ? value.replace(/^0+(?=\d)/, "") : null;
}
function inputFor(shop: string, topic: string, value: unknown, webhookId: string): PrivacyInput {
  if (!["customers/data_request", "customers/redact", "shop/redact"].includes(topic) || !value || typeof value !== "object") throw new ConnectorError("shopify_privacy_payload_invalid");
  const raw = value as Record<string, unknown>, customer = raw.customer as Record<string, unknown> | undefined, request = raw.data_request as Record<string, unknown> | undefined;
  // The HMAC signs the body, not the topic header: distinct payload shapes prevent cross-topic replays.
  if(topic==="shop/redact" && Object.keys(raw).some(key=>!["shop_id","shop_domain"].includes(key)))throw new ConnectorError("shopify_privacy_payload_invalid");
  if(topic==="customers/redact" && (!Array.isArray(raw.orders_to_redact)||raw.data_request!==undefined||raw.orders_requested!==undefined))throw new ConnectorError("shopify_privacy_payload_invalid");
  if(topic==="customers/data_request" && (!request||!id(request.id)||!Array.isArray(raw.orders_requested)||raw.orders_to_redact!==undefined))throw new ConnectorError("shopify_privacy_payload_invalid");
  const shopDomain = normalizeShopifyDomain(shop), shopId = id(raw.shop_id);
  if (!shopId || normalizeShopifyDomain(String(raw.shop_domain || "")) !== shopDomain) throw new ConnectorError("shopify_privacy_shop_mismatch", 401);
  const orders = raw[topic === "customers/data_request" ? "orders_requested" : "orders_to_redact"] ?? [];
  if (!Array.isArray(orders) || orders.length > 5000 || orders.some(order => id(order) === null) || (customer?.id !== undefined && id(customer.id) === null)) throw new ConnectorError("shopify_privacy_payload_invalid");
  // Email and phone are never imported, persisted or included in access-request identifiers.
  return { topic: topic as PrivacyTopic, shopId, shopDomain, customerId: id(customer?.id) || "", orderIds: [...new Set(orders.map(order => id(order)!))], requestId: id(request?.id) || privacyHash(JSON.stringify([topic,shopId,customer?.id || "",orders,webhookId])), now: new Date().toISOString() };
}
function identity(scope: BusinessScope, provider: string, key: string, customerId: string, privacy: BusinessIdentity["privacy"], now: string): BusinessIdentity {
  return { ...scope, id: key, provider, externalId: key, customerId, privacy, firstSeenAt: now, createdAt: now, updatedAt: now };
}
function fence(scope: BusinessScope, input: PrivacyInput, kind: "shop" | "customer" | "order", subject = "") {
  return identity(scope,FENCE_PROVIDER,shopifyPrivacyFenceId(kind,input.shopId,subject),"",{kind:kind === "shop" ? "shop_redaction" : kind === "customer" ? "customer_redaction" : "order_redaction",shopHash:privacyHash(input.shopId)},input.now);
}
function requestRecord(scope: BusinessScope, input: PrivacyInput) {
  return identity(scope,REQUEST_PROVIDER,`spreq_${privacyHash(`${input.shopId}\0${input.requestId}`)}`,input.customerId,{kind:"data_request",shopId:input.shopId,shopDomain:input.shopDomain,orderIds:input.orderIds,status:"pending"},input.now);
}
function rawRow(row: BusinessIdentity) {
  return { id:row.id,user_id:row.userId,project_id:row.projectId,natural_key:privacyHash(JSON.stringify([row.provider,row.externalId])),lookup_key:null,connection_id:null,currency:null,occurred_at:row.firstSeenAt,created_at:row.createdAt,updated_at:row.updatedAt,data:row };
}
async function insertIdentities(tx:TransactionSql, rows:BusinessIdentity[]) {
  for(let offset=0;offset<rows.length;offset+=250){const values=rows.slice(offset,offset+250).map(rawRow);
    if(values.length)await tx`INSERT INTO ss_business_identities(id,user_id,project_id,natural_key,lookup_key,connection_id,currency,occurred_at,created_at,updated_at,data)
      SELECT id,user_id,project_id,natural_key,lookup_key,connection_id,currency,occurred_at,created_at,updated_at,data
      FROM jsonb_to_recordset(${JSON.stringify(values)}::text::jsonb) AS rows(id text,user_id text,project_id text,natural_key text,lookup_key text,connection_id text,currency text,occurred_at timestamptz,created_at timestamptz,updated_at timestamptz,data jsonb)
      ON CONFLICT(user_id,project_id,id) DO NOTHING`;
  }
}
function namespace(provider:string|undefined, externalAccountId:string|undefined, shopId:string) { return provider===`shopify:${shopId}:live` || provider===`shopify:${shopId}:test` || (provider==="shopify" && externalAccountId===shopId); }
function selectedRows(data:LocalBusinessData,input:PrivacyInput) {
  const all=input.topic==="shop/redact",orders=new Set(input.orderIds),customers=new Set(input.customerId?[input.customerId]:[]);
  const transactions=data.transactions.filter(t=>t.provider==="shopify"&&t.externalAccountId===input.shopId&&(all||customers.has(t.customerId||"")||orders.has(shopifyOrderId(t.externalId)||"")));
  for(const row of transactions)if(row.customerId)customers.add(row.customerId);
  const identities=data.identities.filter(i=>namespace(i.provider,i.externalAccountId,input.shopId)&&(all||customers.has(i.provider==="shopify"?i.customerId:i.externalId)));
  const events=data.events.filter(e=>namespace(e.provider,undefined,input.shopId)&&(all||customers.has(e.customerId||"")));
  const clickIds=new Set([...transactions.flatMap(t=>t.clickId?[t.clickId]:[]),...identities.flatMap(i=>i.clickId?[i.clickId]:[]),...events.flatMap(e=>e.clickId?[e.clickId]:[])]);
  const visitors=new Set([...identities.flatMap(i=>i.visitorId?[i.visitorId]:[]),...events.flatMap(e=>e.visitorId?[e.visitorId]:[]),...data.clicks.filter(c=>clickIds.has(c.id)).map(c=>c.visitorId)]);
  const clicks=data.clicks.filter(c=>clickIds.has(c.id)||visitors.has(c.visitorId));
  const extraEvents=data.events.filter(e=>!e.provider&&((e.visitorId&&visitors.has(e.visitorId))||(e.clickId&&clickIds.has(e.clickId))));
  return {transactions,identities,events:[...events,...extraEvents],clicks,customers,visitors};
}
function redactLocal(scope:BusinessScope,data:LocalBusinessData,input:PrivacyInput) {
  const selected=selectedRows(data,input),all=input.topic==="shop/redact";
  const requests=data.identities.filter(i=>i.privacy?.kind==="data_request"&&i.privacy.shopId===input.shopId&&(all||selected.customers.has(i.customerId)||i.privacy.orderIds.some(order=>input.orderIds.includes(order))));
  const fences=[...(all?[fence(scope,input,"shop")]:[...selected.customers].map(customer=>fence(scope,input,"customer",customer))),...input.orderIds.map(order=>fence(scope,input,"order",order)),...[...selected.visitors].map(visitor=>identity(scope,FENCE_PROVIDER,shopifyVisitorFenceId(visitor),"",{kind:"visitor_redaction",shopHash:privacyHash(input.shopId)},input.now)),...requests.map(request=>identity(scope,FENCE_PROVIDER,requestFenceId(request.id),"",{kind:"request_redaction",shopHash:privacyHash(input.shopId)},input.now))];
  for(const row of fences)if(!data.identities.some(i=>i.id===row.id))data.identities.push(row);
  const ids=(rows:Array<{id:string}>)=>new Set(rows.map(row=>row.id)), txIds=ids(selected.transactions),identityIds=ids(selected.identities),eventIds=ids(selected.events),clickIds=ids(selected.clicks);
  data.transactions=data.transactions.filter(t=>!txIds.has(t.id));data.adjustments=data.adjustments.filter(a=>!txIds.has(a.transactionId));
  data.identities=data.identities.filter(i=>!identityIds.has(i.id)&&!(i.privacy?.kind==="data_request"&&i.privacy.shopId===input.shopId&&(all||selected.customers.has(i.customerId)||i.privacy.orderIds.some(order=>input.orderIds.includes(order)))));
  data.events=data.events.filter(e=>!eventIds.has(e.id));data.clicks=data.clicks.filter(c=>!clickIds.has(c.id));
  if(all)data.connections=data.connections.filter(c=>!(c.provider==="shopify"&&c.externalAccountId===input.shopId));
  return {transactions:selected.transactions.length,identities:selected.identities.length,events:selected.events.length,clicks:selected.clicks.length};
}
/** One SQL statement removes the entire selected set without transferring a merchant's ledger to the worker. */
async function redactSql(scope:BusinessScope,tx:TransactionSql,input:PrivacyInput) {
  const all=input.topic==="shop/redact", customerIds=input.customerId?[input.customerId]:[],namespaces=[`shopify:${input.shopId}:live`,`shopify:${input.shopId}:test`];
  await insertIdentities(tx,[...(all?[fence(scope,input,"shop")]:customerIds.map(customer=>fence(scope,input,"customer",customer))),...input.orderIds.map(order=>fence(scope,input,"order",order))]);
  const result=await tx`
    WITH target_transactions AS MATERIALIZED (
      SELECT id,data FROM ss_business_transactions WHERE user_id=${scope.userId} AND project_id=${scope.projectId} AND data->>'provider'='shopify' AND data->>'externalAccountId'=${input.shopId}
        AND (${all} OR data->>'customerId'=ANY(${customerIds}::text[]) OR split_part(data->>'externalId',':',2)=ANY(${input.orderIds}::text[]))
    ), customers AS MATERIALIZED (SELECT unnest(${customerIds}::text[]) AS id UNION SELECT data->>'customerId' FROM target_transactions WHERE data->>'customerId' IS NOT NULL),
    target_identities AS MATERIALIZED (
      SELECT id,data FROM ss_business_identities WHERE user_id=${scope.userId} AND project_id=${scope.projectId}
        AND ((data->>'provider'='shopify' AND data->>'externalAccountId'=${input.shopId} AND (${all} OR data->>'customerId' IN(SELECT id FROM customers))) OR (data->>'provider'=ANY(${namespaces}::text[]) AND (${all} OR data->>'externalId' IN(SELECT id FROM customers))))
    ), target_events AS MATERIALIZED (
      SELECT id,data FROM ss_business_events WHERE user_id=${scope.userId} AND project_id=${scope.projectId} AND data->>'provider'=ANY(${namespaces}::text[]) AND (${all} OR data->>'customerId' IN(SELECT id FROM customers))
    ), click_ids AS MATERIALIZED (SELECT data->>'clickId' AS id FROM target_transactions UNION SELECT data->>'clickId' FROM target_identities UNION SELECT data->>'clickId' FROM target_events),
    visitors AS MATERIALIZED (SELECT data->>'visitorId' AS id FROM target_identities UNION SELECT data->>'visitorId' FROM target_events UNION SELECT data->>'visitorId' FROM ss_business_clicks WHERE user_id=${scope.userId} AND project_id=${scope.projectId} AND id IN(SELECT id FROM click_ids)),
    target_requests AS MATERIALIZED (SELECT id FROM ss_business_identities WHERE user_id=${scope.userId} AND project_id=${scope.projectId} AND data->'privacy'->>'kind'='data_request' AND data->'privacy'->>'shopId'=${input.shopId} AND (${all} OR data->>'customerId' IN(SELECT id FROM customers) OR data->'privacy'->'orderIds' ?| ${input.orderIds}::text[])),
    fence_subjects AS (
      SELECT 'spriv_'||encode(sha256(convert_to('visitor','UTF8')||decode('00','hex')||convert_to(id,'UTF8')),'hex') AS id,'visitor_redaction' AS kind FROM visitors WHERE id IS NOT NULL
      UNION SELECT 'spriv_'||encode(sha256(convert_to('customer','UTF8')||decode('00','hex')||convert_to(${input.shopId},'UTF8')||decode('00','hex')||convert_to(id,'UTF8')),'hex'),'customer_redaction' FROM customers WHERE id IS NOT NULL AND NOT ${all}
      UNION SELECT 'spriv_'||encode(sha256(convert_to('request','UTF8')||decode('00','hex')||convert_to(id,'UTF8')),'hex'),'request_redaction' FROM target_requests
    ), inserted_fences AS (
      INSERT INTO ss_business_identities(id,user_id,project_id,natural_key,occurred_at,created_at,updated_at,data)
      SELECT id,${scope.userId},${scope.projectId},encode(sha256(convert_to('["shopify-privacy-fence","'||id||'"]','UTF8')),'hex'),${input.now}::timestamptz,${input.now}::timestamptz,${input.now}::timestamptz,
      jsonb_build_object('id',id,'userId',${scope.userId}::text,'projectId',${scope.projectId}::text,'provider','shopify-privacy-fence','externalId',id,'customerId','','firstSeenAt',${input.now}::text,'createdAt',${input.now}::text,'updatedAt',${input.now}::text,'privacy',jsonb_build_object('kind',kind,'shopHash',${privacyHash(input.shopId)}::text)) FROM fence_subjects ON CONFLICT(user_id,project_id,id) DO NOTHING RETURNING id
    ), deleted_adjustments AS (DELETE FROM ss_business_adjustments WHERE user_id=${scope.userId} AND project_id=${scope.projectId} AND data->>'transactionId' IN(SELECT id FROM target_transactions) RETURNING id),
    deleted_transactions AS (DELETE FROM ss_business_transactions WHERE user_id=${scope.userId} AND project_id=${scope.projectId} AND id IN(SELECT id FROM target_transactions) RETURNING id),
    deleted_identities AS (DELETE FROM ss_business_identities WHERE user_id=${scope.userId} AND project_id=${scope.projectId} AND (id IN(SELECT id FROM target_identities) OR (data->'privacy'->>'kind'='data_request' AND data->'privacy'->>'shopId'=${input.shopId} AND (${all} OR data->>'customerId' IN(SELECT id FROM customers) OR data->'privacy'->'orderIds' ?| ${input.orderIds}::text[]))) RETURNING id),
    deleted_events AS (DELETE FROM ss_business_events WHERE user_id=${scope.userId} AND project_id=${scope.projectId} AND (id IN(SELECT id FROM target_events) OR (data->>'provider' IS NULL AND (data->>'visitorId' IN(SELECT id FROM visitors) OR data->>'clickId' IN(SELECT id FROM click_ids)))) RETURNING id),
    deleted_clicks AS (DELETE FROM ss_business_clicks WHERE user_id=${scope.userId} AND project_id=${scope.projectId} AND (id IN(SELECT id FROM click_ids) OR data->>'visitorId' IN(SELECT id FROM visitors)) RETURNING id),
    deleted_connections AS (DELETE FROM ss_business_connections WHERE ${all} AND user_id=${scope.userId} AND project_id=${scope.projectId} AND data->>'provider'='shopify' AND data->>'externalAccountId'=${input.shopId} RETURNING id)
    SELECT (SELECT count(*)::integer FROM deleted_transactions) AS transactions,(SELECT count(*)::integer FROM deleted_identities) AS identities,(SELECT count(*)::integer FROM deleted_events) AS events,(SELECT count(*)::integer FROM deleted_clicks) AS clicks`;
  return result[0] as {transactions:number;identities:number;events:number;clicks:number};
}

/** Called only after Shopify HMAC verification. Success means persistence/redaction actually completed. */
export async function processShopifyPrivacy(shop:string,topic:string,payload:unknown,webhookId:string,triggeredAt?:string) {
  const input=inputFor(shop,topic,payload,webhookId);
  if(topic==="shop/redact"){
    if(!triggeredAt || !Number.isFinite(Date.parse(triggeredAt)) || Date.parse(triggeredAt)>Date.now()+300_000)throw new ConnectorError("shopify_event_time_invalid");
    input.now=new Date(triggeredAt).toISOString();
  }
  return withShopifyStoreLock(input.shopDomain,async store=>{
    const connections=(await store.connections()).filter(connection=>connection.externalAccountId===input.shopId);
    const scopes=[...new Map(connections.map(connection=>[`${connection.userId}\0${connection.projectId}`,{userId:connection.userId,projectId:connection.projectId}])).values()].filter(scope=>topic!=="shop/redact"||!connections.some(connection=>connection.userId===scope.userId&&connection.projectId===scope.projectId&&Date.parse(connection.metadata?.shopifyAuthorizedAt||"")>Date.parse(input.now)));
    let processed=0;
    for(const scope of scopes){
      if(input.topic==="customers/data_request"){
        const row=requestRecord(scope,input);
        await mutateBusinessProject(scope,data=>{if(!data.identities.some(i=>i.id===row.id||i.id===requestFenceId(row.id)))data.identities.push(row);},async tx=>{
          const previous=await tx`SELECT id FROM ss_business_identities WHERE user_id=${scope.userId} AND project_id=${scope.projectId} AND id=${requestFenceId(row.id)}`;
          if(!previous.length)await insertIdentities(tx,[row]);
        });
      } else await mutateBusinessProject(scope,data=>redactLocal(scope,data,input),tx=>redactSql(scope,tx,input));
      processed++;
    }
    return {processed,topic};
  });
}
export async function listShopifyPrivacyRequests(scope:BusinessScope) {
  const rows=await listRecords(scope,"identities",{limit:10001});
  if(rows.length>10000)throw new ConnectorError("shopify_privacy_export_limit",409);
  const requests=rows.filter((row):row is BusinessIdentity&{privacy:Extract<NonNullable<BusinessIdentity["privacy"]>,{kind:"data_request"}>}=>row.privacy?.kind==="data_request")
    .map(row=>({id:row.id,shopId:row.privacy.shopId,shopDomain:row.privacy.shopDomain,requestedAt:row.firstSeenAt,status:row.privacy.status}));
  return {pending:requests.filter(row=>row.status==="pending").length,requests};
}
export async function exportShopifyPrivacyRequest(scope:BusinessScope,requestId:string) {
  const record=await getRecord(scope,"identities",requestId);
  if(record?.privacy?.kind!=="data_request")throw new ConnectorError("shopify_privacy_request_not_found",404);
  const request=record.privacy,input:PrivacyInput={topic:"customers/data_request",shopId:request.shopId,shopDomain:request.shopDomain,customerId:record.customerId,orderIds:request.orderIds,requestId,now:new Date().toISOString()};
  return withShopifyStoreLock(request.shopDomain,async()=>mutateBusinessProject(scope, data=>{
    const current=data.identities.find(i=>i.id===requestId);if(current?.privacy?.kind!=="data_request")throw new ConnectorError("shopify_privacy_request_not_found",404);
    const selected=selectedRows(data,input),ids=new Set(selected.transactions.map(t=>t.id));
    current.privacy={...current.privacy,status:"exported",exportedAt:input.now};current.updatedAt=input.now;
    return {requestId,generatedAt:input.now,shopDomain:request.shopDomain,transactions:selected.transactions,adjustments:data.adjustments.filter(a=>ids.has(a.transactionId)),identities:selected.identities,events:selected.events,clicks:selected.clicks};
  },async tx=>{
    const current=await tx`SELECT data FROM ss_business_identities WHERE user_id=${scope.userId} AND project_id=${scope.projectId} AND id=${requestId}`;
    const value=current[0]?.data as BusinessIdentity|undefined;if(value?.privacy?.kind!=="data_request")throw new ConnectorError("shopify_privacy_request_not_found",404);
    // A bounded export fails explicitly rather than silently delivering a truncated subject record.
    const tables=["connections","transactions","adjustments","identities","events","clicks"] as const;
    const data={connections:[],transactions:[],adjustments:[],identities:[],events:[],clicks:[]} as unknown as LocalBusinessData;
    for(const table of tables){const rows=await tx.unsafe(`SELECT data FROM ss_business_${table} WHERE user_id=$1 AND project_id=$2 LIMIT 10001`,[scope.userId,scope.projectId]);if(rows.length>10000)throw new ConnectorError("shopify_privacy_export_limit",409);data[table]=rows.map(row=>row.data) as never;}
    const selected=selectedRows(data,input),ids=new Set(selected.transactions.map(t=>t.id));
    const updated={...value,privacy:{...value.privacy,status:"exported",exportedAt:input.now},updatedAt:input.now};
    await tx`UPDATE ss_business_identities SET data=${JSON.stringify(updated)}::text::jsonb,updated_at=${input.now} WHERE user_id=${scope.userId} AND project_id=${scope.projectId} AND id=${requestId}`;
    return {requestId,generatedAt:input.now,shopDomain:request.shopDomain,transactions:selected.transactions,adjustments:data.adjustments.filter(a=>ids.has(a.transactionId)),identities:selected.identities,events:selected.events,clicks:selected.clicks};
  }));
}
