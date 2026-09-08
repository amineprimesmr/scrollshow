import Stripe from 'stripe';
if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY required; use a test key for staging.');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const offers = [{ name: 'ScrollShow Monthly', cents: 2900, lookup: 'scrollshow_monthly_eur_29_v1', recurring: { interval: 'month' } }, { name: 'ScrollShow Lifetime', cents: 9900, lookup: 'scrollshow_lifetime_eur_99_v1' }];
const apply = process.argv.includes('--apply');
for (const offer of offers) {
  const prices = await stripe.prices.list({ lookup_keys: [offer.lookup], limit: 1 });
  if (prices.data[0]) { console.log(offer.name, prices.data[0].id); continue; }
  if (!apply) { console.log('Would create', offer.name, offer.cents / 100, 'EUR'); continue; }
  const product = await stripe.products.create({ name: offer.name }, { idempotencyKey: offer.lookup + '-product' });
  const price = await stripe.prices.create({ product: product.id, unit_amount: offer.cents, currency: 'eur', recurring: offer.recurring, lookup_key: offer.lookup }, { idempotencyKey: offer.lookup + '-price' });
  console.log(offer.name, price.id);
}
