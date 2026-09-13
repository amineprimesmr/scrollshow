import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database } from "../lib/database";
import * as repository from "../lib/business-analytics/repository";
async function main(){
  const host=new URL(process.env.DATABASE_URL||"").hostname;
  if(host!=="ep-plain-night-b19jhok5.c-5.eu-central-1.aws.neon.tech")throw new Error("This verification is restricted to the explicitly authorized isolated test branch.");
  const scope={userId:`business-test-${randomUUID()}`,projectId:`project-${randomUUID()}`};const other={...scope,projectId:`project-${randomUUID()}`};
  try{
    const input={provider:"stripe" as const,externalAccountId:"acct_isolated",environment:"test" as const,externalId:"charge_same",status:"paid" as const,kind:"initial" as const,amountMinor:1200,taxMinor:200,currency:"EUR",occurredAt:new Date().toISOString(),source:"provider" as const};
    const rows=await Promise.all(Array.from({length:5},()=>repository.saveTransaction(scope,input)));assert.equal(new Set(rows.map(r=>r.id)).size,1);assert.equal((await repository.listTransactions(scope)).length,1);
    await repository.saveTransaction(scope,{...input,status:"pending",amountMinor:0,taxMinor:0});assert.equal((await repository.getRecord(scope,"transactions",rows[0].id))!.amountMinor,1200);
    await repository.saveTransaction(other,input);assert.equal(await repository.getRecord(other,"transactions",rows[0].id),null);
    const link=await repository.saveLink(scope,{slug:randomUUID(),label:"Test",destinationUrl:"https://example.com",active:true});assert.equal((await repository.findPublicLink(link.slug))!.projectId,scope.projectId);
    await assert.rejects(repository.saveLink(other,{slug:link.slug,label:"Collision",destinationUrl:"https://example.com",active:true}));
    const connection=await repository.saveConnection(scope,{provider:"stripe",name:"Isolated",externalAccountId:"acct_isolated",environment:"test",status:"connected",encryptedCredentials:"test-encrypted"});
    const claims=await Promise.all([repository.claimConnectionSync(scope,connection.id),repository.claimConnectionSync(scope,connection.id)]);assert.equal(claims.filter(Boolean).length,1);
    assert.equal(await repository.releaseConnectionSync(scope,connection.id,"invalid",{status:"error"}),false);assert.equal(await repository.releaseConnectionSync(scope,connection.id,claims.find(Boolean)!.syncClaim!,{status:"connected"}),true);
    const csvPayment={...input,id:"csv-payment",provider:"manual" as const,externalAccountId:"csv",externalId:"csv-payment",environment:"live" as const,source:"import" as const};
    await repository.importRecordsAtomically(scope,{transactions:[csvPayment],adjustments:[]});
    const refund=(id:string)=>({id,transactionId:"csv-payment",provider:"manual" as const,externalId:id,kind:"refund" as const,amountMinor:800,taxMinor:100,currency:"EUR",occurredAt:input.occurredAt,source:"import" as const});
    const batches=await Promise.allSettled([repository.importRecordsAtomically(scope,{transactions:[],adjustments:[refund("refund-a")]}),repository.importRecordsAtomically(scope,{transactions:[],adjustments:[refund("refund-b")]})]);
    assert.equal(batches.filter(r=>r.status==="fulfilled").length,1);assert.equal(batches.filter(r=>r.status==="rejected").length,1);
    await assert.rejects(repository.importRecordsAtomically(scope,{transactions:[{...csvPayment,amountMinor:1500}],adjustments:[]}),/csv_existing_payment_conflict/);
    await assert.rejects(repository.importRecordsAtomically(scope,{transactions:[{...csvPayment,id:"rollback-payment",externalId:"rollback-payment"}],adjustments:[{...refund("over-refund"),amountMinor:1000}]}),/csv_refunds_exceed_payment/);
    assert.equal(await repository.getRecord(scope,"transactions","rollback-payment"),null);
    const replay=await repository.importRecordsAtomically(scope,{transactions:[csvPayment],adjustments:[]});assert.equal(replay.skipped,1);assert.equal(replay.imported,0);
    await repository.deleteProject(scope);assert.equal((await repository.readProject(scope)).transactions.length,0);await assert.rejects(repository.saveTransaction(scope,{...input,externalId:"resurrection"}),/business_project_deleted/);assert.equal((await repository.listTransactions(other)).length,1);
    const concurrent=await Promise.allSettled([repository.saveTransaction(other,{...input,externalId:"concurrent-delete"}),repository.deleteUser(scope.userId)]);
    assert.equal(concurrent[1].status,"fulfilled");assert.equal((await repository.readProject(other)).transactions.length,0);
    await assert.rejects(repository.saveTransaction({...scope,projectId:"new-scope-after-deletion"},input),/business_user_deleted/);
    console.log("PASS isolated SQL: 5 concurrent replays, paid/pending race protection, scope isolation, public slug uniqueness, sync leases, atomic concurrent CSV refunds/rollback, concurrent deletion and durable project/user resurrection fences.");
  }finally{await repository.deleteUser(scope.userId);await database().end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Business SQL verification failed");process.exitCode=1;});
