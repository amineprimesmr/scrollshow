import Stripe from 'stripe';
if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_ACCOUNT_ID) throw new Error('Provide STRIPE_SECRET_KEY and STRIPE_ACCOUNT_ID for the intended environment.');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
if ((await stripe.accounts.retrieve()).id !== process.env.STRIPE_ACCOUNT_ID) throw new Error('Wrong Stripe account');
const names = ['STRIPE_PRICE_PRO_MONTHLY', 'STRIPE_PRICE_YEARLY', 'STRIPE_PRICE_LIFETIME'];
for (const name of names) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
  const price = await stripe.prices.retrieve(process.env[name]);
  console.log(JSON.stringify({ variable: name, id: price.id, active: price.active, amount: price.unit_amount, currency: price.currency, interval: price.recurring?.interval || null, live: price.livemode }));
}
