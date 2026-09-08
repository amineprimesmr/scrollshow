import Stripe from "stripe";
const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
if((await stripe.accounts.retrieve()).id!=="acct_1U6V0h3yrYjpyuOy")throw new Error("Wrong Stripe account");
const ids=["price_1UDOo43yrYjpyuOyTXdtTbci","price_1UDOo43yrYjpyuOyjFHmPujl"];
const prices=await Promise.all(ids.map(id=>stripe.prices.retrieve(id)));
const sessions=await stripe.checkout.sessions.list({status:"open",limit:100});
const ours=sessions.data.filter(s=>{try{return new URL(s.success_url).hostname==="scrollshow.io";}catch{return false;}});
const links=await stripe.paymentLinks.list({active:true,limit:100});
const relevant=[];
for(const link of links.data) {const lines=await stripe.paymentLinks.listLineItems(link.id,{limit:10});if(lines.data.some(l=>ids.includes(l.price?.id)))relevant.push({id:link.id,trial:link.subscription_data?.trial_period_days||0});}
console.log(JSON.stringify({prices:prices.map(p=>({id:p.id,amount:p.unit_amount,currency:p.currency,recurring:p.recurring})),openCheckoutSessions:ours.map(s=>({id:s.id,created:s.created,amount:s.amount_total,mode:s.mode,offer:s.metadata?.offer})),paymentLinks:relevant,hasMoreSessions:sessions.has_more,hasMoreLinks:links.has_more}));
