import { existsSync } from 'node:fs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const checks = [
  ['Session signing', Boolean(process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32)],
  ['Transactional production database', Boolean(process.env.DATABASE_URL)],
  ['Private media store', Boolean(process.env.VERCEL_ENV === 'preview' ? process.env.STAGING_READ_WRITE_TOKEN : process.env.BLOB_READ_WRITE_TOKEN)],
  ['Stripe API', Boolean(process.env.STRIPE_SECRET_KEY)],
  ['Stripe monthly EUR 29 price ID', Boolean(process.env.STRIPE_PRICE_PRO_MONTHLY)],
  ['Stripe lifetime EUR 99 price ID', Boolean(process.env.STRIPE_PRICE_LIFETIME)],
  ['Stripe webhook signature', Boolean(process.env.STRIPE_WEBHOOK_SECRET)],
  ['Cron authentication', Boolean(process.env.CRON_SECRET)],
  ['TikTok OAuth', Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET)],
  ['Keyword discovery provider', Boolean(process.env.BRAVE_SEARCH_API_KEY)],
  ['Persistent research library license confirmed', process.env.BRAVE_SEARCH_LIBRARY_LICENSE_CONFIRMED === '1'],
  ['Detailed account metrics', Boolean(process.env.MONID_API_KEY)],
  ['Recovery email delivery', Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)],
  ['Encrypted backups', Boolean(process.env.BACKUP_ENCRYPTION_KEY && Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, 'base64').length === 32)],
  ['Sales explicitly enabled after acceptance testing', process.env.SALES_ENABLED === '1'],
];
for (const [label, ok] of checks) console.log(`${ok ? 'CONFIGURED' : 'MISSING'}  ${label}`);
if (!process.env.CONSUMER_MEDIATOR_NAME) console.log('LEGAL WARNING: consumer mediation deferred by owner; not a certification of compliance.');
console.log('Presence checks only. Verify migrations, price amounts, provider approvals, webhooks, backup restore and real end-to-end publication in staging.');
process.exitCode = checks.every(([,ok])=>ok) ? 0 : 1;
