import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as repo from "../lib/business-analytics/repository";

const scope={userId:"repo-test-user",projectId:"repo-test-project"};
const transaction={provider:"stripe" as const,externalAccountId:"acct_test",environment:"live" as const,externalId:"charge_test",kind:"initial" as const,status:"paid" as const,amountMinor:12000,taxMinor:2000,currency:"EUR",occurredAt:"2026-01-04T00:00:00Z",source:"provider" as const};
test("local relational contract: scoped entities, concurrent idempotency, safe keys and deletions",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"ss-business-repo-"));const previous=process.env.DATABASE_URL;delete process.env.DATABASE_URL;process.env.BUSINESS_ANALYTICS_DATA_DIR=dir;
  try {
    const [first,second]=await Promise.all([repo.saveTransaction(scope,transaction),repo.saveTransaction(scope,transaction)]);
    assert.equal(first.id,second.id);assert.equal((await repo.listTransactions(scope)).length,1);
    await repo.saveTransaction(scope,{...transaction,status:"pending",amountMinor:0,taxMinor:0});assert.equal((await repo.getRecord(scope,"transactions",first.id))?.amountMinor,12000);
    const payload={id:"event-fixed",externalId:"event-fixed",kind:"signup" as const,source:"server" as const,occurredAt:"2026-01-01T00:00:00Z",visitorId:"visitor",clickId:"click",customerId:"customer",provider:"stripe:acct:live"};
    await repo.saveEvent(scope,payload);const retry=await repo.saveEvent(scope,{...payload,occurredAt:"2026-01-02T00:00:00Z"});assert.equal(retry.occurredAt,payload.occurredAt);
    await assert.rejects(repo.saveEvent(scope,{...payload,provider:"stripe:other:live"}),/event_identity_conflict/);
    const other={...scope,projectId:"other-project"};const mirrored=await repo.saveTransaction(other,transaction);assert.notEqual(first.id,mirrored.id);
    assert.equal(await repo.getRecord(other,"transactions",first.id),null);
    await assert.rejects(repo.saveTransaction(scope,{...transaction,externalId:"bad",amountMinor:1.3}),/amount_invalid/);
    const connection=await repo.saveConnection(scope,{provider:"stripe",name:"Test",externalAccountId:"acct",environment:"test",status:"connected",encryptedCredentials:"secret"});
    const claims=await Promise.all([repo.claimConnectionSync(scope,connection.id),repo.claimConnectionSync(scope,connection.id)]);assert.equal(claims.filter(Boolean).length,1);
    assert.equal(await repo.releaseConnectionSync(scope,connection.id,"wrong",{status:"error"}),false);
    assert.equal(await repo.releaseConnectionSync(scope,connection.id,claims.find(Boolean)!.syncClaim!,{status:"connected"}),true);
    const safe=repo.publicConnection({...connection,cursor:"customer-private-cursor",syncClaim:"claim",syncLeaseUntil:"2026-09-13",metadata:{customer:"private"}});
    for(const key of ["encryptedCredentials","encryptedWebhookSecret","cursor","syncClaim","syncLeaseUntil","metadata"])assert.equal(key in safe,false);
    const link=await repo.saveLink(scope,{slug:"random-link",label:"Test",destinationUrl:"https://example.com",active:true});assert.equal((await repo.findPublicLink(link.slug))?.projectId,scope.projectId);
    const key=await repo.saveTrackingKey(scope,{hash:"hash-test",prefix:"ss_biz",active:true});assert.equal((await repo.findByTrackingKeyHash("hash-test"))?.id,key.id);
    await repo.saveTrackingKey(scope,{...key,active:false});assert.equal(await repo.findByTrackingKeyHash("hash-test"),null);assert.equal(await repo.touchTrackingKey(scope,key.id,"hash-test"),false);
    await repo.saveTrackingKey(scope,{...key,hash:"hash-new",active:true});assert.equal(await repo.touchTrackingKey(scope,key.id,"hash-test"),false);assert.equal(await repo.touchTrackingKey(scope,key.id,"hash-new"),true);
    const settings=repo.defaultSettings(scope);await repo.saveSettings(scope,settings);await repo.saveSettings(scope,{...settings,id:"different",currency:"USD"});assert.equal((await repo.listRecords(scope,"settings")).length,1);
    await repo.deleteProject(scope);assert.equal((await repo.readProject(scope)).transactions.length,0);await assert.rejects(repo.saveTransaction(scope,{...transaction,externalId:"resurrection"}),/business_project_deleted/);assert.equal((await repo.listTransactions(other)).length,1);
    await repo.deleteUser(scope.userId);assert.equal((await repo.listTransactions(other)).length,0);await assert.rejects(repo.saveTransaction({...scope,projectId:"new-after-delete"},transaction),/business_user_deleted/);
  }finally{if(previous)process.env.DATABASE_URL=previous;else delete process.env.DATABASE_URL;delete process.env.BUSINESS_ANALYTICS_DATA_DIR;await rm(dir,{recursive:true,force:true});}
});
test("file fallback is unavailable in production",async()=>{
  const env=process.env.NODE_ENV, db=process.env.DATABASE_URL;Object.assign(process.env,{NODE_ENV:"production"});delete process.env.DATABASE_URL;
  try{await assert.rejects(repo.readProject(scope),/business_database_required/);}finally{if(env)Object.assign(process.env,{NODE_ENV:env});else delete (process.env as Record<string,string|undefined>).NODE_ENV;if(db)process.env.DATABASE_URL=db;}
});
