import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeShopifyOrder, shopifyBusinessConnector, shopifyMoneyMinor, verifyShopifyAccount, type ShopifyOrder } from "../lib/business-analytics/connectors/shopify";
import { registerShopifyWebhooks, SHOPIFY_BUSINESS_WEBHOOKS } from "../lib/business-analytics/shopify-webhooks";
import { normalizeShopifyDomain, requestShopifyToken, verifyShopifyCallback, verifyShopifyWebhook } from "../lib/business-analytics/shopify-security";
import { createShopifyState, validateShopifyState, shopifyAuthorizationCandidate } from "../lib/business-analytics/shopify-oauth";
import { acknowledgeShopifyOrders, currentShopifyCredentials, queueShopifyOrder, readShopifyOrderQueue, uninstallShopifyStore } from "../lib/business-analytics/shopify-store";
import { getConnection, listTransactions, saveConnection } from "../lib/business-analytics/repository";
import { assertBusinessConnectionNoOverlap, businessCredentialContext, credentialsForBusinessConnection } from "../lib/business-analytics/connections";
import { encryptBusinessSecret } from "../lib/business-analytics/crypto";
import { processShopifyPrivacy } from "../lib/business-analytics/shopify-privacy";
import { persistBusinessProviderTransactions } from "../lib/business-analytics/sync";
const scope = { userId: "shop-owner", projectId: "shop-project" };
const shop = "test-scrollshow.myshopify.com";
const now = Date.now();
const transaction = { id: "gid://shopify/OrderTransaction/1001", kind: "SALE", status: "SUCCESS", processedAt: new Date(now).toISOString(), test: false, manualPaymentGateway: false, gateway: "shopify_payments", amountSet: { presentmentMoney: { amount: "29.90", currencyCode: "EUR" } }, parentTransaction: null };
const order: ShopifyOrder = { id: "gid://shopify/Order/101", test: false, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), customer: { id: "gid://shopify/Customer/301" }, transactionsCount: { count: 1, precision: "EXACT" }, transactions: [transaction], metafield: { value: "bclick_real" } };
async function isolated(run: () => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "ss-shopify-")); const keys = ["DATABASE_URL", "BUSINESS_ANALYTICS_DATA_DIR", "BUSINESS_ANALYTICS_ENCRYPTION_KEY", "NODE_ENV", "VERCEL", "SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"]; const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  delete process.env.DATABASE_URL; delete process.env.VERCEL; Object.assign(process.env, { BUSINESS_ANALYTICS_DATA_DIR: dir, NODE_ENV: "test", BUSINESS_ANALYTICS_ENCRYPTION_KEY: randomBytes(32).toString("base64"), SHOPIFY_CLIENT_ID: "client-id", SHOPIFY_CLIENT_SECRET: "client-secret" });
  try { await run(); } finally { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } await rm(dir, { recursive: true, force: true }); }
}
async function mocked(run: (input: string, init?: RequestInit) => unknown, action: () => Promise<void>) {
  const previous = global.fetch; global.fetch = async (input, init) => Response.json(await run(String(input), init)); try { await action(); } finally { global.fetch = previous; }
}
function token(access = "access-current", expiry = now + 3600_000) { return { apiKey: access, refreshToken: "refresh-current", issuedAt: new Date(now).toISOString(), expiresAt: new Date(expiry).toISOString(), refreshExpiresAt: new Date(now + 90 * 86400_000).toISOString() }; }
async function connection(id = "bcon_shop", selectedScope = scope) { return saveConnection(selectedScope, { id, provider: "shopify", name: "My Shop", externalAccountId: "201", environment: "live", status: "connected", encryptedCredentials: encryptBusinessSecret(token(), businessCredentialContext({ ...selectedScope, id })), metadata: { shopDomain: shop, shopifyAuthorizedAt: new Date().toISOString(), shopifyWebhookUri: "https://scrollshow.io/api/business/connectors/shopify/events", shopifyWebhooksVerifiedAt: new Date().toISOString() } }); }

test("Shopify permanent domain validation rejects SSRF, credentials, ports and alternate hosts", () => {
  assert.equal(normalizeShopifyDomain("Test-scrollshow"), shop); assert.equal(normalizeShopifyDomain(`https://${shop}/`), shop);
  for (const input of ["http://localhost", "https://127.0.0.1", `${shop}.evil.test`, `https://user@${shop}`, `https://${shop}:444`, `https://${shop}/admin`, "x.myshopify.com?x=y", "a..myshopify.com"]) assert.throws(() => normalizeShopifyDomain(input));
});
test("Shopify callback HMAC validates decoded query, timestamp, duplicates and tampering", () => {
  const url = new URL(`https://scrollshow.io/callback?code=abc&shop=${shop}&state=state&timestamp=${Math.floor(now / 1000)}`); const secret = "private";
  const message = [...url.searchParams].sort(([a],[b])=>a<b?-1:1).map(([key,value])=>`${key}=${value}`).join("&"); url.searchParams.set("hmac", createHmac("sha256",secret).update(message).digest("hex"));
  assert.equal(verifyShopifyCallback(url,secret,now),shop); assert.throws(()=>verifyShopifyCallback(url,secret,now+700_000));
  url.searchParams.append("shop",shop); assert.throws(()=>verifyShopifyCallback(url,secret,now)); url.searchParams.delete("shop"); url.searchParams.set("shop","other.myshopify.com"); assert.throws(()=>verifyShopifyCallback(url,secret,now));
});
test("Shopify OAuth state binds encrypted nonce to owner, project, session, shop and expiry", async () => isolated(async () => {
  const state = createShopifyState(scope,shop,"session-one",now); assert.equal(state.cookie.includes(scope.userId),false);
  validateShopifyState(state.cookie,scope,shop,state.nonce,"session-one",now);
  for (const args of [[{...scope,userId:"other"},shop,state.nonce,"session-one",now],[{...scope,projectId:"other"},shop,state.nonce,"session-one",now],[scope,shop,state.nonce,"session-two",now],[scope,"other.myshopify.com",state.nonce,"session-one",now],[scope,shop,"other","session-one",now],[scope,shop,state.nonce,"session-one",now+601_000]] as const) assert.throws(()=>validateShopifyState(state.cookie,args[0],args[1],args[2],args[3],args[4]));
}));
test("Shopify records only successful nonmanual cash, preserves original currencies and refund parents", () => {
  const result = normalizeShopifyOrder({...order,transactionsCount:{count:6,precision:"EXACT"},transactions:[transaction,{...transaction,id:"gid://shopify/OrderTransaction/1002",kind:"AUTHORIZATION"},{...transaction,id:"gid://shopify/OrderTransaction/1003",status:"PENDING"},{...transaction,id:"gid://shopify/OrderTransaction/1004",manualPaymentGateway:true},{...transaction,id:"gid://shopify/OrderTransaction/1005",kind:"REFUND",amountSet:{presentmentMoney:{amount:"5.00",currencyCode:"EUR"}},parentTransaction:{id:transaction.id,kind:"SALE"}},{...transaction,id:"gid://shopify/OrderTransaction/1006",test:true}]});
  assert.equal(result.transactions.length,3); assert.equal(result.transactions[0].amountMinor,2990); assert.equal(result.transactions[0].taxMinor,null); assert.equal(result.transactions[0].customerId,"301"); assert.equal(result.transactions[1].originalTransactionId,"order:101:transaction:1001"); assert.equal(result.transactions[1].amountMinor,500); assert.equal(result.transactions[2].environment,"sandbox"); assert.ok(result.warnings.includes("shopify_manual_payment_unverified"));
  assert.ok(normalizeShopifyOrder({...order,transactionsCount:{count:101,precision:"EXACT"}}).warnings.includes("shopify_transactions_truncated"));
  assert.equal(shopifyMoneyMinor({amount:"1.234",currencyCode:"KWD"}),1234); assert.equal(shopifyMoneyMinor({amount:"100.0",currencyCode:"JPY"}),100); assert.equal(shopifyMoneyMinor({amount:"1.001",currencyCode:"EUR"}),null);
});
test("Shopify signed webhook checks exact body before JSON and account routing", () => {
  const raw='{"id":101}'; const headers=new Headers({"x-shopify-shop-domain":shop,"x-shopify-hmac-sha256":createHmac("sha256","secret").update(raw).digest("base64")}); assert.equal(verifyShopifyWebhook(raw,headers,"secret"),shop); assert.throws(()=>verifyShopifyWebhook(raw+" ",headers,"secret")); assert.throws(()=>verifyShopifyWebhook("broken",new Headers(),"secret"));
});
test("Shopify API verify checks shop identity and scopes; never fetches PII fields", async () => {
  await mocked((url,init)=>{assert.equal(url,`https://${shop}/admin/api/2026-07/graphql.json`);const body=JSON.parse(String(init?.body));assert.equal(/email|phone|address/.test(body.query),false);return{data:{shop:{id:"gid://shopify/Shop/201",name:"My Shop",myshopifyDomain:shop},currentAppInstallation:{accessScopes:[{handle:"read_orders"}]},orders:{nodes:[]}}};},async()=>{assert.equal((await verifyShopifyAccount(token(),shop)).externalAccountId,"201");});
  await mocked(()=>({data:{shop:{id:"gid://shopify/Shop/201",name:"Wrong",myshopifyDomain:"other.myshopify.com"},currentAppInstallation:{accessScopes:[{handle:"read_orders"}]},orders:{nodes:[]}}}),async()=>assert.rejects(()=>verifyShopifyAccount(token(),shop),/shopify_shop_mismatch/));
});
test("Shopify grants require expiring offline token and read_orders, without exposing rejected response", async () => isolated(async () => {
  await mocked((_url,init)=>{const fields=new URLSearchParams(String(init?.body));assert.equal(fields.get("expiring"),"1");return{access_token:"access",refresh_token:"refresh",expires_in:3600,refresh_token_expires_in:7776000,scope:"read_orders"};},async()=>{assert.equal((await requestShopifyToken(shop,{code:"code",expiring:"1"},now)).credentials.expiresAt,new Date(now+3600_000).toISOString());});
  await mocked(()=>({access_token:"secret-private",scope:"read_orders"}),async()=>{await assert.rejects(()=>requestShopifyToken(shop,{code:"code",expiring:"1"}),/shopify_expiring_token_required/);});
}));
test("Shopify rotating token is shared across projects and concurrent refreshes request once", async () => isolated(async () => {
  const a=await connection();const b=await connection("bcon_second",{userId:"second-owner",projectId:"second-project"});const expired=token("expired",now-1000);
  for(const row of[a,b])await saveConnection({userId:row.userId,projectId:row.projectId},{...row,encryptedCredentials:encryptBusinessSecret(expired,businessCredentialContext(row))});let calls=0;
  await mocked(()=>{calls++;return{access_token:"rotated-access",refresh_token:"rotated-refresh",expires_in:3600,refresh_token_expires_in:7776000,scope:"read_orders"};},async()=>{const results=await Promise.all([currentShopifyCredentials(shop,expired),currentShopifyCredentials(shop,expired)]);assert.equal(calls,1);assert.ok(results.every(row=>row.apiKey==="rotated-access"));});
  assert.equal(credentialsForBusinessConnection((await getConnection(b,b.id))!).refreshToken,"rotated-refresh");
}));
test("Shopify queue coalesces replay, acknowledges only matching event versions, and survives failed persistence", async () => isolated(async () => {
  const row=await connection();const first={id:"101",eventId:"11111111-1111-1111-1111-111111111111"};const second={...first,eventId:"22222222-2222-2222-2222-222222222222"};
  await queueShopifyOrder(shop,first);await queueShopifyOrder(shop,first);assert.deepEqual(await readShopifyOrderQueue(shop,row.id),[first]);
  await queueShopifyOrder(shop,second);await acknowledgeShopifyOrders(row,[first]);assert.deepEqual(await readShopifyOrderQueue(shop,row.id),[second]);
  await mocked((_url,init)=>{assert.match(String(init?.body),/ScrollShowQueuedOrders/);return{data:{nodes:[order]}};},async()=>{
    const batch=await shopifyBusinessConnector.history(token(),{provider:"shopify",externalAccountId:"201",environment:"production",shopDomain:shop,connectionId:row.id},null,new Date(now-90*86400_000).toISOString());
    assert.deepEqual(await readShopifyOrderQueue(shop,row.id),[second]);await persistBusinessProviderTransactions(scope,row,batch.transactions);await persistBusinessProviderTransactions(scope,row,batch.transactions);assert.equal((await listTransactions(row)).length,1);await acknowledgeShopifyOrders(row,batch.shopifyAcknowledgements!);
  });assert.deepEqual(await readShopifyOrderQueue(shop,row.id),[]);
}));
test("Shopify uninstall clears all matching credentials and queues without calling provider", async () => isolated(async () => {
  const row=await connection();await queueShopifyOrder(shop,{id:"101",eventId:"11111111-1111-1111-1111-111111111111"});await uninstallShopifyStore(shop,"999",new Date(Date.now()+1000).toISOString());assert.equal((await getConnection(row,row.id))?.status,"connected");await uninstallShopifyStore(shop,"201",new Date(Date.now()+1000).toISOString());const deleted=await getConnection(row,row.id);assert.equal(deleted?.status,"disconnected");assert.equal(deleted?.encryptedCredentials,undefined);assert.deepEqual(await readShopifyOrderQueue(shop,row.id),[]);
}));
test("Shopify delayed uninstall from a previous installation cannot delete reauthorized tokens", async () => isolated(async () => {
  const row = await connection();
  await uninstallShopifyStore(shop,"201",new Date(Date.now()-60_000).toISOString());
  assert.equal((await getConnection(scope,row.id))?.status,"connected");
  assert.ok((await getConnection(scope,row.id))?.encryptedCredentials);
}));
test("Shopify historical reconciliation clamps access to 60 days and keeps pagination coverage explicit", async () => isolated(async () => {
  const row = await connection();
  await mocked((_url,init)=>{const query=JSON.parse(String(init?.body)); const floor=Date.parse(query.variables.query.split(">=")[1]);assert.ok(floor>=Date.now()-60*86400_000-1000);assert.match(query.query,/orders\(first:5/);assert.equal(/email|address|phone|receiptJson/.test(query.query),false);return{data:{orders:{nodes:[order],pageInfo:{hasNextPage:true,endCursor:"cursor-next"}}}};},async()=>{
    const batch=await shopifyBusinessConnector.history(token(),{provider:"shopify",externalAccountId:"201",environment:"production",shopDomain:shop,connectionId:row.id},null,new Date(now-90*86400_000).toISOString()); assert.equal(batch.complete,false);assert.equal(batch.cursor,"cursor-next");assert.equal(batch.transactions[0].amountMinor,2990);
  });
}));
test("Shopify registers four scoped webhooks in one mutation, redacts payload fields, and is idempotent", async () => {
  const uri = new URL("/api/business/connectors/shopify/events",process.env.NEXT_PUBLIC_SITE_URL || "https://scrollshow.io").toString();let calls=0;
  await mocked((_url,init)=>{calls++;const body=JSON.parse(String(init?.body));if(body.query.includes("ScrollShowWebhookSubscriptions"))return{data:{webhookSubscriptions:{nodes:[],pageInfo:{hasNextPage:false}}}};
    assert.equal(Object.keys(body.variables).length,8);assert.deepEqual(body.variables.input0.includeFields,["id"]);assert.deepEqual(body.variables.input2.includeFields,["id","order_id"]);assert.deepEqual(body.variables.input3.includeFields,["id","myshopify_domain"]);assert.equal(body.variables.input0.uri,uri);
    return{data:Object.fromEntries([0,1,2,3].map(index=>[`w${index}`,{webhookSubscription:{id:`gid://shopify/WebhookSubscription/${index+1}`},userErrors:[]}]))};
  },async()=>{assert.equal((await registerShopifyWebhooks(shop,token())).registered,4);assert.equal(calls,2);});
  calls=0;await mocked(()=>{calls++;return{data:{webhookSubscriptions:{nodes:SHOPIFY_BUSINESS_WEBHOOKS.map((row,index)=>({...row,id:`gid://shopify/WebhookSubscription/${index+1}`,uri})),pageInfo:{hasNextPage:false}}}};},async()=>{await registerShopifyWebhooks(shop,token());assert.equal(calls,1);});
});
test("Shopify failed webhook registration does not claim all topics are active", async () => {
  await mocked((_url,init)=>JSON.parse(String(init?.body)).query.includes("ScrollShowWebhookSubscriptions")?{data:{webhookSubscriptions:{nodes:[],pageInfo:{hasNextPage:false}}}}:{data:Object.fromEntries([0,1,2,3].map(index=>[`w${index}`,{webhookSubscription:index===2?null:{id:`gid://shopify/WebhookSubscription/${index+1}`},userErrors:index===2?[{field:["topic"]}]:[]}]))},async()=>{await assert.rejects(()=>registerShopifyWebhooks(shop,token()),/shopify_webhooks_registration_failed/);});
});
test("Shopify privacy tombstone skips one payment without blocking another sale or queue acknowledgement", async () => isolated(async () => {
  const row=await connection();const queued={id:"101",eventId:"11111111-1111-1111-1111-111111111111"};await queueShopifyOrder(shop,queued);
  await processShopifyPrivacy(shop,"customers/redact",{shop_id:201,shop_domain:shop,customer:{id:301},orders_to_redact:[101]},queued.eventId);
  const transactions=[...normalizeShopifyOrder(order).transactions,...normalizeShopifyOrder({...order,id:"gid://shopify/Order/102",customer:{id:"gid://shopify/Customer/302"},transactions:[{...transaction,id:"gid://shopify/OrderTransaction/1002"}]}).transactions];
  assert.equal(await persistBusinessProviderTransactions(scope,row,transactions),1);assert.equal((await listTransactions(scope)).length,1);
  await acknowledgeShopifyOrders(row,[queued]);assert.deepEqual(await readShopifyOrderQueue(shop,row.id),[]);
  await uninstallShopifyStore(shop,"201",new Date(Date.now()+1000).toISOString());
  await assert.rejects(()=>persistBusinessProviderTransactions(scope,row,transactions),/connection_disconnected/);
}));
test("Shopify reauthorization preserves an existing secondary source when Stripe is monetary", async () => isolated(async () => {
  const row=await connection();const secondary={...row,monetarySource:false};const stripe={...row,id:"bcon_stripe",provider:"stripe" as const,externalAccountId:"acct_real",metadata:{},monetarySource:true};
  const candidate=shopifyAuthorizationCandidate(shop,[secondary,stripe]);assert.equal(candidate.id,row.id);assert.equal(candidate.monetarySource,false);assert.doesNotThrow(()=>assertBusinessConnectionNoOverlap(candidate,[secondary,stripe]));
  assert.throws(()=>assertBusinessConnectionNoOverlap(shopifyAuthorizationCandidate("new.myshopify.com",[stripe]),[stripe]),/stripe_shopify_overlap/);
}));
test("Shopify gift cards and store credit do not create cash receipts or cash refunds", () => {
  for(const gateway of["gift_card","store_credit","shopify_store_credit"]){
    const sale=normalizeShopifyOrder({...order,transactions:[{...transaction,gateway}]});assert.equal(sale.transactions.length,0);assert.ok(sale.warnings.includes("shopify_non_cash_transaction_excluded"));
    const refund=normalizeShopifyOrder({...order,transactions:[{...transaction,gateway,kind:"REFUND",parentTransaction:{id:transaction.id,kind:"SALE"}}]});assert.equal(refund.transactions.length,0);
  }
});
