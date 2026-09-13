import type { BusinessSnapshot, BusinessDashboard, BusinessScope, BusinessTransaction, BusinessPublication, BusinessClick, BusinessAdjustment, PublicationOutcome, BusinessConnection } from "./model";
import { defaultBusinessSettings, publicConnection } from "./repository";

const DAY = 86400000;
const at = (value?: string | null) => value ? Date.parse(value) : NaN;
const within = (value: string, from: number, to: number) => at(value) >= from && at(value) < to;
const percentage = (part: number, total: number) => total > 0 ? Math.round(part / total * 1000) / 10 : null;
const mean = (value: number | null, count: number) => value !== null && count > 0 ? Math.round(value / count) : null;
const sumKnown = (values: Array<number | null>): number | null => values.some(v => v === null) ? null : values.reduce<number>((n,v) => n + (v || 0),0);
const customerKey = (t: BusinessTransaction) => t.customerId ? `${t.provider}:${t.externalAccountId}:${t.environment}:${t.customerId}` : "";
const saleKey = (t: BusinessTransaction) => t.canonicalId ? `${t.environment}:canonical:${t.canonicalId}` : `${t.provider}:${t.externalAccountId}:${t.environment}:${t.externalId}`;
export type DashboardOptions = { days?: number; horizon?: number; horizonDays?: number; currency?: string; now?: Date | string; scope?: BusinessScope };
export type ResolvedAttribution = { publicationId?: string; campaign?: string; clickId?: string; model: string; acquisitionKnown: boolean };

/** Read-only credit rule. An arbitrary publication ID on a payment is not proof of a click. */
export function resolveAttributions(snapshot: BusinessSnapshot, transactions: BusinessTransaction[], windowDays: number): Map<string, ResolvedAttribution> {
  const result = new Map<string, ResolvedAttribution>();
  const clicks = snapshot.clicks.filter(c => !c.isBot);
  const publicationIds = new Map(snapshot.publications.map(p => [p.id,p]));
  const acquisitions = new Map<string, ResolvedAttribution>();
  const ordered = [...transactions].sort((a,b) => at(a.occurredAt) - at(b.occurredAt) || a.id.localeCompare(b.id));
  for (const transaction of ordered) {
    const key = customerKey(transaction);
    if (transaction.kind === "renewal") {
      const acquisition = key ? acquisitions.get(key) : undefined;
      if (acquisition) result.set(transaction.id,{...acquisition,model:"acquisition_cohort"});
      continue;
    }
    const matching = snapshot.identities.filter(i => {
      const namespace = `${transaction.provider}:${transaction.externalAccountId}:${transaction.environment}`;
      const scopedProvider = i.provider === namespace || (i.provider === transaction.provider && i.externalAccountId === transaction.externalAccountId && i.environment === transaction.environment);
      return scopedProvider && transaction.customerId && (i.customerId === transaction.customerId || i.externalId === transaction.customerId);
    });
    const identityClicks = new Set(matching.flatMap(i => i.clickId ? [i.clickId] : []));
    const visitors = new Set(matching.flatMap(i => i.visitorId ? [i.visitorId] : []));
    const candidates = clicks.filter(click => {
      const time = at(click.occurredAt), purchase = at(transaction.occurredAt);
      if (time > purchase || purchase - time > windowDays * DAY) return false;
      if (click.id !== transaction.clickId && !identityClicks.has(click.id) && !visitors.has(click.visitorId)) return false;
      const publication = click.publicationId ? publicationIds.get(click.publicationId) : undefined;
      return !click.publicationId || Boolean(publication && at(publication.publishedAt) <= time);
    }).sort((a,b) => at(b.occurredAt)-at(a.occurredAt) || a.id.localeCompare(b.id));
    const click = candidates[0];
    if (!click) continue;
    const credit: ResolvedAttribution = { publicationId: click.publicationId, campaign: click.campaign, clickId: click.id,
      model:`last_observed_non_direct_click_${windowDays}d`, acquisitionKnown: transaction.acquisitionKnown === true || matching.some(i=>i.acquisitionKnown === true) };
    result.set(transaction.id,credit);
    // Only an explicitly established acquisition may carry later subscription renewals.
    if (key && !acquisitions.has(key) && (transaction.kind === "initial" || credit.acquisitionKnown)) acquisitions.set(key,credit);
  }
  return result;
}

type Refund = { gross: number; tax: number | null; dated: Array<{ at: string; gross: number; tax: number | null }>; undated: boolean };
function refundFor(transaction: BusinessTransaction, adjustments: BusinessAdjustment[], now: number): Refund {
  const rows = adjustments.filter(a => a.transactionId === transaction.id && a.currency === transaction.currency && at(a.occurredAt) <= now);
  const dated = rows.map(a => ({ at:a.occurredAt, gross:a.amountMinor * (a.kind === "reversal" ? -1 : 1), tax:a.taxMinor === null ? null : a.taxMinor * (a.kind === "reversal" ? -1 : 1) }));
  const detailedGross = Math.max(0,dated.reduce((n,a)=>n+a.gross,0));
  const cumulative = transaction.refundUpdatedAt && at(transaction.refundUpdatedAt) > now ? 0 : transaction.refundedAmountMinor || 0;
  const gap = Math.max(0,cumulative-detailedGross);
  let undated = false;
  if (gap) {
    const taxKnown = transaction.refundedTaxMinor != null && dated.every(a=>a.tax !== null);
    const tax = taxKnown ? Math.max(0,transaction.refundedTaxMinor!-dated.reduce((n,a)=>n+(a.tax||0),0)) : null;
    if (transaction.refundUpdatedAt && at(transaction.refundUpdatedAt) <= now) dated.push({at:transaction.refundUpdatedAt,gross:gap,tax});
    else undated = true;
  }
  const gross = Math.min(transaction.amountMinor,Math.max(detailedGross,cumulative));
  let tax: number | null = 0;
  if (gross > 0) {
    if (cumulative > detailedGross && cumulative > 0) tax = transaction.refundedTaxMinor ?? null;
    else tax = dated.every(a=>a.tax !== null) ? Math.max(0,dated.reduce((n,a)=>n+(a.tax||0),0)) : null;
  }
  return {gross,tax,dated,undated};
}
function netOf(transaction: BusinessTransaction, refund: Refund): number | null {
  if (transaction.taxMinor === null || refund.tax === null) return null;
  return transaction.amountMinor - transaction.taxMinor - (refund.gross - refund.tax);
}
function historyCovers(connections: BusinessConnection[], publication: BusinessPublication, end: number, truncated: string[]) {
  if (truncated.some(k => ["transactions","adjustments","connections","clicks","identities","publications"].includes(k))) return false;
  const monetary = connections.filter(c=>c.environment === "live" && c.status !== "disconnected" && c.monetarySource !== false);
  return monetary.length > 0 && monetary.every(c=>Boolean(c.lastSyncedAt && at(c.lastSyncedAt) >= end && (c.historyComplete === true && c.historyStartedAt && at(c.historyStartedAt) <= at(publication.publishedAt))));
}

export function buildBusinessDashboard(snapshot: BusinessSnapshot, options: DashboardOptions = {}): BusinessDashboard {
  const now = options.now ? new Date(options.now).getTime() : Date.now();
  if (!Number.isFinite(now)) throw new Error("business_date_invalid");
  const scope = options.scope || snapshot.scope || snapshot.settings[0] || snapshot.publications[0] || snapshot.connections[0] || {userId:"unknown",projectId:"unknown"};
  const registeredPublications = snapshot.publications;
  snapshot = { ...snapshot, publications: snapshot.publications.filter(p => p.lifecycle !== "planned") };
  const settings = snapshot.settings[0] || defaultBusinessSettings(scope,new Date(now).toISOString());
  const days = Math.max(1,Math.min(365,Math.trunc(options.days || 30)));
  const horizon = Math.max(1,Math.min(365,Math.trunc(options.horizon || options.horizonDays || settings.horizonDays || 30)));
  const currency = (options.currency || settings.currency || "EUR").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("business_currency_invalid");
  const from = now - days*DAY, cohortTo = now - horizon*DAY, cohortFrom = cohortTo - days*DAY;
  const iso = (value:number)=>new Date(value).toISOString();
  const activeConnections = snapshot.connections.filter(c=>c.environment === "live" && c.monetarySource !== false);
  const connectionMap = new Map(snapshot.connections.map(c=>[c.id,c]));
  const uniqueSales = new Map<string,BusinessTransaction>();
  for (const transaction of [...snapshot.transactions].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))) {
    if (transaction.environment !== "live" || transaction.status !== "paid" || at(transaction.occurredAt) > now) continue;
    if (transaction.connectionId && connectionMap.get(transaction.connectionId)?.monetarySource === false) continue;
    if (!uniqueSales.has(saleKey(transaction))) uniqueSales.set(saleKey(transaction),transaction);
  }
  const allTransactions = [...uniqueSales.values()];
  const transactions = allTransactions.filter(t=>t.currency === currency);
  const refunds = new Map(transactions.map(t=>[t.id,refundFor(t,snapshot.adjustments,now)]));
  const credit = resolveAttributions(snapshot,allTransactions,settings.attributionWindowDays || 7);
  const cashSales = transactions.filter(t=>within(t.occurredAt,from,now));
  const hasMoneyData = transactions.length > 0 || activeConnections.some(c=>c.lastSyncedAt && c.status !== "configuration_required");
  const cashAdjustments = transactions.flatMap(t=>refunds.get(t.id)!.dated).filter(a=>within(a.at,from,now));
  const cashGross = cashSales.reduce((n,t)=>n+t.amountMinor,0), cashTax = sumKnown(cashSales.map(t=>t.taxMinor));
  const cashRefund = cashAdjustments.reduce((n,a)=>n+a.gross,0), cashRefundTax = sumKnown(cashAdjustments.map(a=>a.tax));
  const unknownCashRefund = [...refunds.values()].some(r=>r.undated);
  const financialTruncated = snapshot.truncated.some(k=>["transactions","adjustments","connections"].includes(k));
  const cashNet = hasMoneyData && !financialTruncated && cashTax !== null && cashRefundTax !== null && !unknownCashRefund ? cashGross-cashTax-cashRefund+cashRefundTax : null;
  const cashPublications = snapshot.publications.filter(p=>within(p.publishedAt,from,now));
  const publications = snapshot.publications.filter(p=>within(p.publishedAt,cohortFrom,now)).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
  const costAllocations = new Map<string,number>();
  for (const cost of snapshot.costs.filter(c=>c.currency===currency && at(c.incurredAt)<=now)) {
    const targets = cost.publicationId ? snapshot.publications.filter(p=>p.id===cost.publicationId) : cost.contentId ? snapshot.publications.filter(p=>p.contentId===cost.contentId) : [];
    // Stable integer allocation: all shares sum exactly to the recorded cost.
    targets.sort((a,b)=>a.id.localeCompare(b.id)).forEach((p,i)=>costAllocations.set(p.id,(costAllocations.get(p.id)||0)+Math.floor(cost.amountMinor/targets.length)+(i<cost.amountMinor%targets.length?1:0)));
  }
  const hasUnallocatedCosts = snapshot.costs.some(c=>(!c.publicationId && !c.contentId) || c.currency!==currency);
  const knownFees = transactions.filter(t => { const p = publications.find(p => p.id === credit.get(t.id)?.publicationId); return p && within(p.publishedAt,cohortFrom,cohortTo) && within(t.occurredAt,at(p.publishedAt),at(p.publishedAt)+horizon*DAY); }).every(t => t.feeMinor != null);
  const costsComplete = settings.costsComplete && !hasUnallocatedCosts && knownFees && !snapshot.truncated.includes("costs");
  const outcomes: PublicationOutcome[] = publications.map(publication=> {
    const published = at(publication.publishedAt), end=published+horizon*DAY;
    const mature = end<=now;
    let reason: PublicationOutcome["exclusionReason"] = null;
    if (!mature) reason="immature";
    else if (!publication.trackingStartedAt) reason="tracking_missing";
    else if (at(publication.trackingStartedAt)>published || (publication.trackingEndedAt && at(publication.trackingEndedAt)<end)) reason="tracking_incomplete";
    else if (!historyCovers(activeConnections,publication,end,snapshot.truncated)) reason="history_incomplete";
    const matched = transactions.filter(t=>credit.get(t.id)?.publicationId===publication.id && within(t.occurredAt,published,end));
    const initial = sumKnown(matched.filter(t=>t.kind!=="renewal").map(t=>netOf(t,refunds.get(t.id)!)));
    const renewal = sumKnown(matched.filter(t=>t.kind==="renewal").map(t=>netOf(t,refunds.get(t.id)!)));
    const revenue = sumKnown([initial,renewal]);
    const cost = (costAllocations.get(publication.id)||0) + matched.reduce((n,t)=>n+(t.feeMinor||0),0);
    const periodEvents = snapshot.events.filter(e=>e.publicationId===publication.id && within(e.occurredAt,published,Math.min(end,now)) && e.source!=="manual");
    const periodClicks = snapshot.clicks.filter(c=>c.publicationId===publication.id && !c.isBot && c.source==="landing" && within(c.occurredAt,published,Math.min(end,now)));
    const buyerIds = new Set(matched.filter(t=>t.kind!=="renewal").map(customerKey).filter(Boolean));
    return {id:publication.id,title:publication.title,contentId:publication.contentId,channelId:publication.channelId,url:publication.url,publishedAt:publication.publishedAt,
      ageDays:Math.max(0,Math.floor((now-published)/DAY)),format:publication.format,hook:publication.hook,cta:publication.cta,mature,eligible:reason===null,exclusionReason:reason,
      views:publication.views ?? null,horizonViews:publication.viewsHorizonDays===horizon ? publication.viewsAtHorizon ?? null : null,
      visits:new Set([...periodClicks.map(c=>c.visitorId),...periodEvents.filter(e=>e.kind==="visit").map(e=>e.visitorId).filter((id):id is string=>Boolean(id))]).size,
      signups:new Set(periodEvents.filter(e=>e.kind==="signup").map(e=>e.customerId||e.visitorId||e.id)).size,buyers:buyerIds.size,
      initialRevenueMinor:hasMoneyData?initial:null,renewalRevenueMinor:hasMoneyData?renewal:null,revenueMinor:hasMoneyData?revenue:null,
      costMinor:cost,contributionMinor:costsComplete && revenue!==null && hasMoneyData ? revenue-cost:null,
      attributionMethods:[...new Set(matched.map(t=>credit.get(t.id)!.model))]};
  });
  const matureOutcomes = outcomes.filter(p=>within(p.publishedAt,cohortFrom,cohortTo));
  const eligible = matureOutcomes.filter(p=>p.eligible);
  const eligibleIds = new Set(eligible.map(p=>p.id));
  const cohortSales = transactions.filter(t=> {const p=snapshot.publications.find(p=>p.id===credit.get(t.id)?.publicationId);return p && eligibleIds.has(p.id) && within(t.occurredAt,at(p.publishedAt),at(p.publishedAt)+horizon*DAY);});
  const cohortBuyers = new Set(cohortSales.filter(t=>t.kind!=="renewal").map(customerKey).filter(Boolean));
  const knownNewBuyers = new Set(cohortSales.filter(t=>t.kind!=="renewal" && credit.get(t.id)?.acquisitionKnown).map(customerKey).filter(Boolean));
  const revenue = eligible.length ? sumKnown(eligible.map(p=>p.revenueMinor)) : null;
  const initialRevenue = eligible.length ? sumKnown(eligible.map(p=>p.initialRevenueMinor)) : null;
  const renewalRevenue = eligible.length ? sumKnown(eligible.map(p=>p.renewalRevenueMinor)) : null;
  const cost = eligible.reduce((n,p)=>n+p.costMinor,0);
  const contribution = eligible.length && costsComplete ? sumKnown(eligible.map(p=>p.contributionMinor)) : null;
  const horizonViews = eligible.length && eligible.every(p=>p.horizonViews!==null) ? eligible.reduce((n,p)=>n+(p.horizonViews||0),0):null;
  const positiveInitial = cashSales.filter(t=>t.kind!=="renewal" && t.amountMinor>0);
  const attributedInitial = positiveInitial.filter(t=> {const c=credit.get(t.id);return c?.publicationId || c?.campaign;});
  const positiveAmount = positiveInitial.reduce((n,t)=>n+t.amountMinor,0), attributedAmount=attributedInitial.reduce((n,t)=>n+t.amountMinor,0);
  const serverEvents=snapshot.events.filter(e=>e.source!=="manual" && within(e.occurredAt,from,now));
  const visitTimes=new Map<string,number>();
  for(const click of snapshot.clicks.filter(c=>!c.isBot && c.source==="landing" && within(c.occurredAt,from,now))) visitTimes.set(click.visitorId,Math.min(visitTimes.get(click.visitorId)??Infinity,at(click.occurredAt)));
  for(const event of serverEvents.filter(e=>e.kind==="visit"&&e.visitorId))visitTimes.set(event.visitorId!,Math.min(visitTimes.get(event.visitorId!)??Infinity,at(event.occurredAt)));
  const visitIds=new Set(visitTimes.keys());
  const signupEvents=serverEvents.filter(e=>e.kind==="signup" && e.visitorId && visitTimes.has(e.visitorId) && at(e.occurredAt)>=visitTimes.get(e.visitorId)!);
  const signupVisitors=new Set(signupEvents.map(e=>e.visitorId!));
  const activatedVisitors=new Set<string>();
  for(const activation of serverEvents.filter(e=>e.kind==="activation"))for(const signup of signupEvents){
    const same=activation.visitorId===signup.visitorId || (activation.customerId && activation.customerId===signup.customerId && activation.provider && activation.provider===signup.provider);
    if(same && at(activation.occurredAt)>=at(signup.occurredAt))activatedVisitors.add(signup.visitorId!);
  }
  const paidVisitors=new Set<string>();
  for(const transaction of cashSales)for(const signup of signupEvents){
    if(at(transaction.occurredAt)<at(signup.occurredAt))continue;
    const namespace=`${transaction.provider}:${transaction.externalAccountId}:${transaction.environment}`;
    const linked=snapshot.identities.some(identity=>(identity.provider===namespace || (identity.provider===transaction.provider && identity.externalAccountId===transaction.externalAccountId && identity.environment===transaction.environment)) && (identity.customerId===transaction.customerId||identity.externalId===transaction.customerId) && identity.visitorId===signup.visitorId);
    const direct=signup.provider===namespace && signup.customerId===transaction.customerId;
    if(transaction.customerId && (linked || direct))paidVisitors.add(signup.visitorId!);
  }
  const measuredActivation=serverEvents.some(e=>e.kind==="activation");
  const buyerPopulation=measuredActivation?new Set([...paidVisitors].filter(id=>activatedVisitors.has(id))):paidVisitors;
  const funnelComplete=!snapshot.truncated.some(k=>["events","clicks","identities","transactions"].includes(k));
  const trackingObserved=serverEvents.length>0 || visitIds.size>0;
  const warnings:string[]=[];
  if (snapshot.truncated.length) warnings.push("history_truncated");
  if (matureOutcomes.some(p=>p.exclusionReason==="tracking_missing"||p.exclusionReason==="tracking_incomplete")) warnings.push("publication_tracking_incomplete");
  if (matureOutcomes.some(p=>p.exclusionReason==="history_incomplete")) warnings.push("commerce_history_incomplete");
  if (transactions.some(t=>t.taxMinor===null)) warnings.push("tax_unknown");
  if (!costsComplete) warnings.push("costs_incomplete");
  if (unknownCashRefund) warnings.push("refund_date_unknown");
  if (snapshot.transactions.some(t=>t.source==="import")) warnings.push("imported_sales_not_provider_verified");
  if (allTransactions.some(t=>t.currency!==currency)) warnings.push("multiple_currencies_not_converted");
  const freshness=activeConnections.map(c=>c.lastSyncedAt).filter((date):date is string=>Boolean(date)).sort();
  const formatNames=[...new Set(eligible.map(p=>p.format))];
  const timeline=new Map<string,{date:string;grossMinor:number;refundsMinor:number;sales:number}>();
  for(let day=0;day<days;day++){const date=iso(from+day*DAY).slice(0,10);timeline.set(date,{date,grossMinor:0,refundsMinor:0,sales:0});}
  for(const t of cashSales){const date=t.occurredAt.slice(0,10);const row=timeline.get(date)||{date,grossMinor:0,refundsMinor:0,sales:0};row.grossMinor+=t.amountMinor;row.sales++;timeline.set(date,row);}
  for(const a of cashAdjustments){const date=a.at.slice(0,10);const row=timeline.get(date)||{date,grossMinor:0,refundsMinor:0,sales:0};row.refundsMinor+=a.gross;timeline.set(date,row);}
  const insights:BusinessDashboard["insights"]=[];
  if(!hasMoneyData)insights.push({id:"connect_money",kind:"info",title:"Connecter les ventes",detail:"Les métriques de revenu apparaissent après un import ou une synchronisation vérifiée."});
  if(!trackingObserved)insights.push({id:"install_tracking",kind:"info",title:"Vérifier le parcours",detail:"Un lien créé ne prouve pas que les visites, inscriptions et achats sont reliés."});
  if(matureOutcomes.length&&!eligible.length)insights.push({id:"no_complete_cohort",kind:"warning",title:"Aucune cohorte complète",detail:"Les publications sans suivi complet restent visibles et ne deviennent pas des zéros dans le revenu par post."});
  if(eligible.length>0&&eligible.length<10)insights.push({id:"small_cohort",kind:"info",title:"Petit échantillon",detail:`${eligible.length} publications admissibles : comparer ces observations sans en faire une prévision.`});
  if(contribution!==null&&contribution<0)insights.push({id:"negative_contribution",kind:"warning",title:"Coûts supérieurs au revenu attribué",detail:"Revoir les coûts et le parcours observé avant d'augmenter le volume."});
  if(cashSales.length&&attributedInitial.length<positiveInitial.length)insights.push({id:"unattributed_sales",kind:"info",title:"Des ventes restent sans origine",detail:"Cette part reste non attribuée ; elle n'est pas répartie au prorata des vues."});
  const measuredVisits=trackingObserved, measuredSignups=serverEvents.some(e=>e.kind==="signup");
  const customerCohorts = [30,90].map(horizonDays=> {
    const first = new Map<string,BusinessTransaction>();
    for(const t of [...transactions].sort((a,b)=>at(a.occurredAt)-at(b.occurredAt))) if(t.kind!=="renewal" && credit.get(t.id)?.acquisitionKnown && customerKey(t) && !first.has(customerKey(t))) first.set(customerKey(t),t);
    const customers=[...first.values()].filter(t=>at(t.occurredAt)+horizonDays*DAY<=now && credit.get(t.id)?.publicationId);
    const values=customers.map(first=>sumKnown(transactions.filter(t=>customerKey(t)===customerKey(first)&&within(t.occurredAt,at(first.occurredAt),at(first.occurredAt)+horizonDays*DAY)).map(t=>netOf(t,refunds.get(t.id)!))));
    const complete=customers.length>0 && !financialTruncated && customers.every(t=> {const c=t.connectionId?connectionMap.get(t.connectionId):undefined;return c?.historyComplete&&c.historyStartedAt&&at(c.historyStartedAt)<=at(t.occurredAt)&&c.lastSyncedAt&&at(c.lastSyncedAt)>=at(t.occurredAt)+horizonDays*DAY;});
    const revenueMinor=complete?sumKnown(values):null;
    return {horizonDays,customers:customers.length,revenueMinor,revenuePerCustomerMinor:mean(revenueMinor,customers.length),renewalCustomers:customers.filter(first=>transactions.some(t=>customerKey(t)===customerKey(first)&&t.kind==="renewal"&&within(t.occurredAt,at(first.occurredAt),at(first.occurredAt)+horizonDays*DAY))).length};
  });
  return { generatedAt:iso(now),currency,days,horizonDays:horizon,period:{from:iso(from),to:iso(now)},cohortPeriod:{from:iso(cohortFrom),to:iso(cohortTo)},
    cash:{grossMinor:hasMoneyData&&!financialTruncated?cashGross:null,taxMinor:hasMoneyData&&!financialTruncated?cashTax:null,refundsMinor:hasMoneyData&&!financialTruncated&&!unknownCashRefund?cashRefund:null,netRevenueMinor:cashNet,sales:financialTruncated?null:cashSales.length,
      newBuyers:financialTruncated?null:new Set(cashSales.filter(t=>t.acquisitionKnown&&t.kind!=="renewal").map(customerKey).filter(Boolean)).size,publications:snapshot.truncated.includes("publications")?null:cashPublications.length,globalRevenuePerPostMinor:snapshot.truncated.includes("publications")?null:mean(cashNet,cashPublications.length),currencies:[...new Set(allTransactions.map(t=>t.currency))].sort()},
    content:{revenueMinor:revenue,initialRevenueMinor:initialRevenue,renewalRevenueMinor:renewalRevenue,revenuePerPostMinor:mean(revenue,eligible.length),costMinor:cost,contributionMinor:contribution,contributionPerPostMinor:mean(contribution,eligible.length),buyers:cohortBuyers.size,
      acquisitionCostMinor:costsComplete&&knownNewBuyers.size?Math.round(cost/knownNewBuyers.size):null,revenuePerThousandViewsMinor:revenue!==null&&horizonViews&&horizonViews>0?Math.round(revenue/horizonViews*1000):null,
      eligiblePublications:eligible.length,totalPublications:matureOutcomes.length,immaturePublications:outcomes.filter(p=>!p.mature).length,excludedPublications:matureOutcomes.length-eligible.length},
    coverage:{publicationPercent:snapshot.truncated.includes("publications")?null:percentage(eligible.length,matureOutcomes.length),attributedSalesPercent:funnelComplete?percentage(attributedInitial.length,positiveInitial.length):null,attributedRevenuePercent:funnelComplete?percentage(attributedAmount,positiveAmount):null,measuredViewsPercent:percentage(eligible.filter(p=>p.horizonViews!==null).length,eligible.length),knownTaxesPercent:financialTruncated?null:percentage(cashSales.filter(t=>t.taxMinor!==null).length,cashSales.length),costsComplete,truncated:snapshot.truncated,warnings,lastSyncedAt:freshness[0]||null},
    funnel:[{key:"visits",label:"Visiteurs suivis",count:visitIds.size,rate:null,measured:measuredVisits&&funnelComplete},{key:"signups",label:"Visiteurs inscrits",count:signupVisitors.size,rate:measuredSignups&&funnelComplete?percentage(signupVisitors.size,visitIds.size):null,measured:measuredSignups&&funnelComplete},{key:"activations",label:"Inscrits activés",count:activatedVisitors.size,rate:measuredActivation&&funnelComplete?percentage(activatedVisitors.size,signupVisitors.size):null,measured:measuredActivation&&funnelComplete},{key:"buyers",label:"Acheteurs de cette cohorte",count:buyerPopulation.size,rate:hasMoneyData&&funnelComplete?percentage(buyerPopulation.size,measuredActivation?activatedVisitors.size:signupVisitors.size):null,measured:hasMoneyData&&funnelComplete}],
    customerCohorts,
    publicationOutcomes:outcomes,formats:formatNames.map(format=>{const rows=eligible.filter(p=>p.format===format);const value=sumKnown(rows.map(p=>p.revenueMinor));return {format,publications:rows.length,buyers:rows.reduce((n,p)=>n+p.buyers,0),revenueMinor:value,revenuePerPostMinor:mean(value,rows.length),contributionMinor:costsComplete?sumKnown(rows.map(p=>p.contributionMinor)):null};}),
    timeline:[...timeline.values()].sort((a,b)=>a.date.localeCompare(b.date)),insights,settings,connections:snapshot.connections.map(publicConnection),publications:registeredPublications,links:snapshot.links,costs:snapshot.costs,experiments:snapshot.experiments,
    events:snapshot.events.map(({customerId:_customer,visitorId:_visitor,clickId:_click,...e})=>e),transactions:allTransactions.map(({customerId:_customer,subscriptionId:_subscription,clickId:_click,...t})=>({...t,publicationId:credit.get(t.id)?.publicationId || (t.source==="import"&&t.attributionModel==="manual_import"?t.publicationId:undefined),attributionModel:credit.get(t.id)?.model || (t.source==="import"?t.attributionModel:undefined)})),adjustments:snapshot.adjustments,
    capabilities:{storageReady:true,trackingKeyConfigured:snapshot.trackingKeys.some(k=>k.active),trackingObserved,providerConnected:activeConnections.some(c=>c.status==="connected"||c.status==="syncing"),historyComplete:!financialTruncated&&activeConnections.length>0&&activeConnections.every(c=>c.historyComplete===true)} };
}
export const buildDashboard = buildBusinessDashboard;
