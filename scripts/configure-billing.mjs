import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import Stripe from 'stripe';
const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const target = arg('environment'), file = arg('file'), account = arg('account');
if (!['production', 'preview', 'development'].includes(target) || !file || !account) throw new Error('Usage: --environment=production|preview|development --file=/private/billing.env --account=acct_... [--apply]');
const env = parseEnv(readFileSync(file, 'utf8'));
const keys = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'STRIPE_PRICE_PRO_MONTHLY', 'STRIPE_PRICE_LIFETIME', 'STRIPE_PRICE_YEARLY'];
for (const key of keys) if (!env[key]) throw new Error(`Missing ${key}`);
const live = target === 'production';
if (!env.STRIPE_SECRET_KEY.startsWith(live ? 'sk_live_' : 'sk_test_') || !env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.startsWith(live ? 'pk_live_' : 'pk_test_')) throw new Error('Stripe mode does not match the selected environment');
if (!env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')) throw new Error('Invalid webhook secret');
const stripe = new Stripe(env.STRIPE_SECRET_KEY);
if ((await stripe.accounts.retrieve()).id !== account) throw new Error('Wrong Stripe account');
for (const [name, cents, interval] of [['STRIPE_PRICE_PRO_MONTHLY', 2900, 'month'], ['STRIPE_PRICE_LIFETIME', 9900, null], ['STRIPE_PRICE_YEARLY', 19900, 'year']]) {
  const price = await stripe.prices.retrieve(env[name]);
  if (!price.active || price.currency !== 'eur' || price.unit_amount !== cents || price.livemode !== live || (price.recurring?.interval || null) !== interval) throw new Error(`Price mismatch: ${name}`);
}
console.log(`Validated ${target} billing configuration for ${account}. No secret values are displayed.`);
if (!process.argv.includes('--apply')) { console.log('Dry run. Add --apply to update only this environment.'); process.exit(0); }
for (const name of keys) {
  const result = spawnSync('vercel', ['env', 'update', name, target, '--yes'], { input: env[name], encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(`Could not update ${name} in ${target}. Stop before deploying; existing values were not removed. Create missing variables explicitly, then rerun.`);
  console.log(`Updated ${name} (${target})`);
}
console.log('Configuration updated. Validate the selected deployment before promoting it. Local and other environments were not modified.');
