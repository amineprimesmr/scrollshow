import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLifetime } from '../lib/billing';
import { emptyStore } from '../lib/store';

test('lifetime discounts require a completed Stripe order and the full price before discount', () => {
  const data = emptyStore();
  data.users.push({id:'u',email:'test@example.com',name:'Test',plan:'free',createdAt:'2026-09-20',stripeCustomerId:'cus'});
  const free = {mode:'payment',status:'complete',payment_status:'no_payment_required',metadata:{offer:'lifetime'},amount_subtotal:9900,amount_total:0,total_details:{amount_discount:9900},currency:'eur',client_reference_id:'u',customer:'cus',payment_intent:null};
  for (const patch of [{status:'open'},{payment_status:'unpaid'},{amount_subtotal:100},{total_details:{amount_discount:0}},{amount_total:1},{customer:'other'},{client_reference_id:'other'},{currency:'usd'}]) {
    assert.equal(applyLifetime(data,{...free,...patch} as never),false);
    assert.equal(data.users[0].plan,'free');
  }
  assert.equal(applyLifetime(data,free as never),true);
  assert.equal(applyLifetime(data,{...free,payment_status:'paid'} as never),true);
  assert.equal(data.users[0].plan,'lifetime');
  assert.equal(data.users[0].lifetimePaymentId,undefined);
  assert.equal(applyLifetime(data,free as never),true);
  const paid = {...free,payment_status:'paid',amount_total:4950,total_details:{amount_discount:4950},payment_intent:'pi_discount'};
  assert.equal(applyLifetime(data,paid as never),true);
  assert.equal(data.users[0].lifetimePaymentId,'pi_discount');
  data.refundedLifetimePayments=['pi_discount'];
  assert.equal(applyLifetime(data,paid as never),false);
});
