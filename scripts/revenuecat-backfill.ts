/** Import unique des abonnes ScrollShow deja payants dans RevenueCat.
 *
 * Le webhook Stripe ne declare que les achats qui passent apres son
 * branchement : sans ce script, RevenueCat afficherait un MRR ScrollShow qui
 * demarre a zero le jour de la connexion. Un abonnement declare ici est
 * ensuite suivi par RevenueCat comme les autres, avec son historique lu
 * directement chez Stripe.
 *
 * Rejouable sans risque : re-declarer un abonnement le rafraichit, il ne le
 * duplique pas. A blanc par defaut, ecrit seulement avec --apply.
 *
 *   npx tsx scripts/revenuecat-backfill.ts                 # ce qui serait envoye
 *   npx tsx scripts/revenuecat-backfill.ts --apply         # envoie
 */
import { parseArgs } from "node:util";
import { postStripePurchase, RevenueCatError, revenueCatEnabled, type StripePurchase } from "../lib/revenuecat";
import { readStore } from "../lib/store";
import { stripe } from "../lib/stripe";

type Planned = StripePurchase & { email: string; why: string };

/** L'offre a vie se declare par sa session de paiement, et on ne garde que
 * l'intention de paiement : Stripe fait le lien dans l'autre sens. */
async function sessionOfPayment(intent: string): Promise<string | null> {
  const sessions = await stripe().checkout.sessions.list({ payment_intent: intent, limit: 1 });
  return sessions.data[0]?.id || null;
}

async function main() {
  const { values } = parseArgs({
    options: { apply: { type: "boolean", default: false }, limit: { type: "string" }, help: { type: "boolean", default: false } },
  });
  if (values.help) {
    console.log("npx tsx scripts/revenuecat-backfill.ts [--apply] [--limit N]\nDeclare a RevenueCat les abonnes ScrollShow deja payants. A blanc sans --apply.\nRequiert STRIPE_SECRET_KEY, l'acces a la base, et REVENUECAT_STRIPE_PUBLIC_KEY pour --apply.");
    return;
  }
  if (values.apply && !revenueCatEnabled()) throw new Error("REVENUECAT_STRIPE_PUBLIC_KEY manquante : c'est la cle publique de l'app Stripe du projet RevenueCat.");

  const data = await readStore();
  const planned: Planned[] = [];
  for (const user of data.users) {
    // Les deux peuvent coexister (un abonne passe a l'offre a vie) et les deux
    // sont du revenu reel : on declare chacun, RevenueCat lira leur vrai etat.
    if (user.stripeSubscriptionId) planned.push({ appUserId: user.id, fetchToken: user.stripeSubscriptionId, email: user.email, why: `abonnement (${user.plan})` });
    if (user.lifetimePaymentId) {
      const session = await sessionOfPayment(user.lifetimePaymentId).catch(() => null);
      if (session) planned.push({ appUserId: user.id, fetchToken: session, email: user.email, why: "offre a vie" });
      else console.warn(`session de paiement introuvable pour ${user.email} (${user.lifetimePaymentId}) : a declarer a la main`);
    }
  }

  const limit = values.limit ? Number(values.limit) : planned.length;
  if (!Number.isFinite(limit) || limit < 0) throw new Error("--limit attend un entier");
  const batch = planned.slice(0, limit);

  console.log(`${planned.length} achat(s) a declarer, ${batch.length} dans ce lot :`);
  for (const item of batch) console.log(`  ${item.email.padEnd(34)} ${item.fetchToken.padEnd(30)} ${item.why}`);
  if (!values.apply) {
    console.log("\nA blanc : rien n'a ete envoye. Relance avec --apply pour declarer.");
    return;
  }

  let sent = 0;
  const failed: { email: string; fetchToken: string; reason: string }[] = [];
  for (const item of batch) {
    try {
      await postStripePurchase({ appUserId: item.appUserId, fetchToken: item.fetchToken });
      sent += 1;
    } catch (error) {
      failed.push({ email: item.email, fetchToken: item.fetchToken, reason: error instanceof RevenueCatError ? `${error.code}: ${error.message}` : String(error) });
      // Une cle refusee ne se repare pas en insistant sur les suivants.
      if (error instanceof RevenueCatError && error.code === "unauthorized") break;
    }
    // La lecture client de RevenueCat plafonne a 480 appels par minute.
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  console.log(`\n${sent} declare(s), ${failed.length} en echec.`);
  for (const item of failed) console.error(`  ${item.email} ${item.fetchToken} — ${item.reason}`);
  if (failed.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
