import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBusinessDashboard, resolveAttributions } from "../lib/business-analytics/metrics";
import { defaultBusinessSettings, BUSINESS_COLLECTIONS } from "../lib/business-analytics/repository";
import type { BusinessSnapshot, BusinessPublication, BusinessTransaction, OwnedEntity } from "../lib/business-analytics/model";
const scope={userId:"user",projectId:"business"};const now="2026-03-02T00:00:00Z";
const base=(id:string):OwnedEntity=>({...scope,id,createdAt:"2026-01-01T00:00:00Z",updatedAt:now});
const publication=(id:string,date="2026-01-02T00:00:00Z"):BusinessPublication=>({...base(id),title:id,publishedAt:date,format:"tutorial",trackingStartedAt:"2026-01-01T00:00:00Z",contentId:"shared"});
const transaction=(id:string):BusinessTransaction=>({...base(id),connectionId:"conn",provider:"stripe",externalAccountId:"acct",environment:"live",externalId:id,kind:"initial",status:"paid",amountMinor:12000,taxMinor:2000,feeMinor:200,currency:"EUR",occurredAt:"2026-01-10T00:00:00Z",source:"provider",customerId:"buyer",clickId:"click",acquisitionKnown:true});
function snapshot():BusinessSnapshot {return {...Object.fromEntries(BUSINESS_COLLECTIONS.map(k=>[k,[]])),scope,truncated:[],loadedAt:now,settings:[{...defaultBusinessSettings(scope),costsComplete:true}],connections:[{...base("conn"),provider:"stripe",name:"Store",externalAccountId:"acct",environment:"live",status:"connected",historyComplete:true,historyStartedAt:"2025-01-01T00:00:00Z",lastSyncedAt:now}],publications:[publication("p1"),publication("p2","2026-01-03T00:00:00Z")],clicks:[{...base("click"),linkId:"link",publicationId:"p1",visitorId:"visitor",occurredAt:"2026-01-08T00:00:00Z",source:"redirect"}],transactions:[transaction("sale")],costs:[{...base("cost"),contentId:"shared",name:"Design",amountMinor:2000,currency:"EUR",category:"production",source:"manual",incurredAt:"2026-01-01T00:00:00Z"}]} as unknown as BusinessSnapshot;}
test("mature mean includes publications with no sale and missing views; fees and shared costs counted once",()=>{
  const result=buildBusinessDashboard(snapshot(),{now});
  assert.equal(result.content.eligiblePublications,2);assert.equal(result.content.revenueMinor,10000);assert.equal(result.content.revenuePerPostMinor,5000);
  assert.equal(result.content.costMinor,2200);assert.equal(result.content.contributionMinor,7800);assert.equal(result.content.revenuePerThousandViewsMinor,null);
  assert.equal(result.publicationOutcomes.find(p=>p.id==="p2")?.revenueMinor,0);
});
test("late partial refunds revise original J30 and affect cash on actual refund date",()=>{
  const data=snapshot();data.adjustments.push({...base("refund"),provider:"stripe",externalId:"refund",transactionId:"sale",kind:"refund",amountMinor:2400,taxMinor:400,currency:"EUR",occurredAt:"2026-02-20T00:00:00Z",source:"provider"});
  const result=buildBusinessDashboard(data,{now});assert.equal(result.content.revenueMinor,8000);assert.equal(result.cash.netRevenueMinor,-2000);assert.equal(result.cash.refundsMinor,2400);
});
test("renewals keep acquisition but post J30 differs from customer D30",()=>{
  const data=snapshot();data.transactions.push({...transaction("renewal"),kind:"renewal",clickId:undefined,occurredAt:"2026-02-05T00:00:00Z"});
  const result=buildBusinessDashboard(data,{now});assert.equal(result.content.revenueMinor,10000);assert.equal(result.content.renewalRevenueMinor,0);assert.equal(result.customerCohorts.find(c=>c.horizonDays===30)?.revenueMinor,20000);
  assert.equal(result.transactions.find(t=>t.id==="renewal")?.publicationId,"p1");
});
test("click window and publication horizon both apply, untrusted publication annotation is ignored",()=>{
  const data=snapshot();data.transactions[0]={...transaction("sale"),occurredAt:"2026-01-15T00:00:00.001Z",publicationId:"p2"};assert.equal(resolveAttributions(data,data.transactions,7).size,0);
  data.transactions[0].occurredAt="2026-01-15T00:00:00Z";assert.equal(resolveAttributions(data,data.transactions,7).get("sale")?.publicationId,"p1");
  data.clicks[0].occurredAt="2026-01-30T00:00:00Z";data.transactions[0].occurredAt="2026-02-02T00:00:00Z";assert.equal(buildBusinessDashboard(data,{now}).content.revenueMinor,0);
});
test("partial tracking, incomplete import and immature/planned publications do not become mature averages",()=>{
  const data=snapshot();data.publications[0].trackingStartedAt="2026-01-05T00:00:00Z";data.publications.push({...publication("planned"),lifecycle:"planned"});data.publications.push(publication("fresh","2026-02-20T00:00:00Z"));
  const result=buildBusinessDashboard(data,{now});assert.equal(result.content.totalPublications,2);assert.equal(result.content.eligiblePublications,1);assert.equal(result.content.immaturePublications,1);assert.equal(result.publications.length,4);
  data.connections[0].historyComplete=false;assert.equal(buildBusinessDashboard(data,{now}).content.revenuePerPostMinor,null);
  data.connections[0].historyComplete=true;data.truncated=["publications"];assert.equal(buildBusinessDashboard(data,{now}).content.revenuePerPostMinor,null);
});
test("unknown taxes/fees and cost completeness yield unknown net/contribution, without currency mixing",()=>{
  const data=snapshot();data.transactions[0].taxMinor=null;let result=buildBusinessDashboard(data,{now});assert.equal(result.content.revenueMinor,null);assert.equal(result.content.contributionMinor,null);
  data.transactions[0].taxMinor=2000;data.transactions[0].feeMinor=null;result=buildBusinessDashboard(data,{now});assert.equal(result.content.revenueMinor,10000);assert.equal(result.content.contributionMinor,null);
  data.transactions.push({...transaction("USD"),currency:"USD",amountMinor:90000});assert.equal(buildBusinessDashboard(data,{now}).content.revenueMinor,10000);
});
test("test transactions and secondary mirrors excluded; canonical sale deduplicated",()=>{
  const data=snapshot();data.transactions.push({...transaction("test"),environment:"test"});data.transactions[0].canonicalId="order1";data.transactions.push({...transaction("mirror"),canonicalId:"order1"});assert.equal(buildBusinessDashboard(data,{now}).content.revenueMinor,10000);
  data.connections.push({...data.connections[0],id:"secondary",provider:"revenuecat",monetarySource:false});data.transactions.push({...transaction("other"),connectionId:"secondary",provider:"revenuecat"});assert.equal(buildBusinessDashboard(data,{now}).content.revenueMinor,10000);
});
test("same customer ID on another merchant cannot inherit attribution",()=>{
  const data=snapshot();data.transactions[0].clickId=undefined;data.identities.push({...base("identity"),provider:"stripe:other-account:live",externalId:"buyer",customerId:"buyer",visitorId:"visitor",firstSeenAt:"2026-01-01T00:00:00Z"});assert.equal(buildBusinessDashboard(data,{now}).content.revenueMinor,0);
  data.identities[0].provider="stripe:acct:live";assert.equal(buildBusinessDashboard(data,{now}).content.revenueMinor,10000);
});
test("cumulative and detailed refund overlap is not counted twice; reversal restores revenue",()=>{
  const data=snapshot();data.transactions[0].refundedAmountMinor=2400;data.transactions[0].refundUpdatedAt="2026-02-20T00:00:00Z";
  data.adjustments.push({...base("refund"),provider:"stripe",externalId:"refund",transactionId:"sale",kind:"refund",amountMinor:2400,taxMinor:400,currency:"EUR",occurredAt:"2026-02-20T00:00:00Z",source:"provider"});
  assert.equal(buildBusinessDashboard(data,{now}).content.revenueMinor,8000);data.transactions[0].refundedAmountMinor=0;data.adjustments.push({...data.adjustments[0],id:"reverse",externalId:"reverse",kind:"reversal",occurredAt:"2026-02-22T00:00:00Z"});assert.equal(buildBusinessDashboard(data,{now}).content.revenueMinor,10000);
});
test("funnel uses a linked visitor cohort and cannot join identical customer IDs across merchants",()=>{
  const data=snapshot();data.clicks[0].occurredAt="2026-02-10T00:00:00Z";data.clicks[0].source="landing";
  data.events.push({...base("signup"),kind:"signup",source:"server",occurredAt:"2026-02-11T00:00:00Z",visitorId:"visitor",customerId:"buyer",provider:"stripe:other:live"});data.transactions[0].occurredAt="2026-02-12T00:00:00Z";
  let result=buildBusinessDashboard(data,{now});assert.equal(result.funnel.find(f=>f.key==="buyers")?.count,0);
  data.events[0].provider="stripe:acct:live";result=buildBusinessDashboard(data,{now});assert.equal(result.funnel.find(f=>f.key==="buyers")?.count,1);assert.equal(result.funnel.find(f=>f.key==="buyers")?.rate,100);
});
test("manual declared attribution remains in ledger but never becomes verified-click revenue",()=>{
  const data=snapshot();data.transactions[0]={...transaction("declared"),clickId:undefined,publicationId:"p1",source:"import",attributionModel:"manual_import"};const result=buildBusinessDashboard(data,{now});assert.equal(result.content.revenueMinor,0);assert.equal(result.transactions[0].publicationId,"p1");assert.equal(result.transactions[0].attributionModel,"manual_import");
});
