import type { BusinessConnection } from "./model";
import { ConnectorError } from "./connectors/types";
export function assertBusinessConnectionNoOverlap(connection:Pick<BusinessConnection,"provider"|"environment"|"id"|"metadata"|"monetarySource">,others:BusinessConnection[]){
  if(connection.monetarySource===false)return;
  const includesStripe=(source:Pick<BusinessConnection,"provider"|"metadata">)=>source.provider==="stripe"||(source.provider==="revenuecat"&&source.metadata?.excludeStripe==="false");
  const monetary=others.filter(other=>other.id!==connection.id&&other.monetarySource!==false&&other.environment===connection.environment);
  if(monetary.some(other=>(includesStripe(connection)&&other.provider==="shopify")||(connection.provider==="shopify"&&includesStripe(other))))throw new ConnectorError("stripe_shopify_overlap",409);
  if(monetary.some(other=>(connection.provider==="stripe"&&other.provider==="revenuecat"&&other.metadata?.excludeStripe==="false")||(connection.provider==="revenuecat"&&connection.metadata?.excludeStripe==="false"&&other.provider==="stripe")))throw new ConnectorError("stripe_revenuecat_overlap",409);
}
