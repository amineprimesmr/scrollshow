import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { stripeForResource, verifiedStripeEvent } from '../lib/stripe';

test('billing selects the legacy account only for a resource missing from the current account', async () => {
  let reads=0;
  const primary={customers:{async retrieve(){throw Object.assign(new Error('missing'),{code:'resource_missing'});}}} as unknown as Stripe;
  const legacy={customers:{async retrieve(id:string){reads++;return {id};}}} as unknown as Stripe;
  assert.equal(await stripeForResource('customers','cus_fixture',primary,legacy),legacy);assert.equal(reads,1);
  const unavailable={customers:{async retrieve(){throw Object.assign(new Error('unavailable'),{code:'api_connection_error'});}}} as unknown as Stripe;
  await assert.rejects(stripeForResource('customers','cus_fixture',unavailable,legacy),/unavailable/);assert.equal(reads,1);
});

test('each Stripe webhook signature selects its own account; an unknown signature is rejected', () => {
  process.env.STRIPE_SECRET_KEY='sk_test_primary_fixture';process.env.STRIPE_LEGACY_SECRET_KEY='sk_test_legacy_fixture';
  process.env.STRIPE_WEBHOOK_SECRET='whsec_primary_fixture';process.env.STRIPE_LEGACY_WEBHOOK_SECRET='whsec_legacy_fixture';
  const sdk=new Stripe('sk_test_fixture');const payload=JSON.stringify({id:'evt_fixture',type:'customer.subscription.updated',data:{object:{id:'sub_fixture'}}});
  const sign=(secret:string)=>sdk.webhooks.generateTestHeaderString({payload,secret});
  const current=verifiedStripeEvent(payload,sign('whsec_primary_fixture'));
  const legacy=verifiedStripeEvent(payload,sign('whsec_legacy_fixture'));
  assert.equal(current.legacy,false);assert.equal(legacy.legacy,true);assert.notEqual(current.client,legacy.client);
  assert.equal(legacy.event.id,'evt_fixture');assert.throws(()=>verifiedStripeEvent(payload,sign('whsec_unrecognized')),/stripe_signature_invalid/);
});
