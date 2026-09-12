import Stripe from 'stripe';
if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY required; use a test key for staging.');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const offers = [
  { name: 'ScrollShow Monthly', cents: 2900, lookup: 'scrollshow_monthly_eur_29_v1', recurring: { interval: 'month' } },
  { name: 'ScrollShow Yearly', cents: 19900, lookup: 'scrollshow_yearly_eur_199_v1', recurring: { interval: 'year' } },
  { name: 'ScrollShow Lifetime', cents: 9900, lookup: 'scrollshow_lifetime_eur_99_v1' },
];
const apply = process.argv.includes('--apply');
if (apply && process.env.STRIPE_SECRET_KEY.startsWith('sk_live_')) {
  if (!process.argv.includes('--allow-live') || !process.env.STRIPE_ACCOUNT_ID) throw new Error('Live provisioning requires --allow-live and STRIPE_ACCOUNT_ID.');
  if ((await stripe.accounts.retrieve()).id !== process.env.STRIPE_ACCOUNT_ID) throw new Error('Wrong Stripe account');
}
// --only=<mot> limite l'execution a une offre : indispensable en live, ou les
// prix historiques n'ont pas de lookup_key et seraient recrees en double.
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice('--only='.length);
for (const offer of offers) {
  if (only && !offer.lookup.includes(only)) continue;
  const prices = await stripe.prices.list({ lookup_keys: [offer.lookup], limit: 1 });
  if (prices.data[0]) { console.log(offer.name, prices.data[0].id); continue; }
  if (!apply) { console.log('Would create', offer.name, offer.cents / 100, 'EUR'); continue; }
  const product = await stripe.products.create({ name: offer.name }, { idempotencyKey: offer.lookup + '-product' });
  const price = await stripe.prices.create({ product: product.id, unit_amount: offer.cents, currency: 'eur', recurring: offer.recurring, lookup_key: offer.lookup }, { idempotencyKey: offer.lookup + '-price' });
  console.log(offer.name, price.id);
}
