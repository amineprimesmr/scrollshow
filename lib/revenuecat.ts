/** Declaration des achats Stripe a RevenueCat.
 *
 * ScrollShow encaisse avec son propre Stripe Checkout, donc en dehors des flux
 * d'achat RevenueCat : pour RevenueCat, un abonnement ScrollShow n'existe que
 * si on le lui declare une fois. Ensuite il le suit lui-meme comme un
 * abonnement de store (renouvellements, resiliations, remboursements) et aucun
 * appel par evenement n'est necessaire.
 *
 * Re-declarer le meme abonnement ne cree pas de doublon : ca force sa
 * relecture. C'est la seule facon de ne pas attendre les deux heures que met
 * une resiliation Stripe a remonter d'elle-meme, donc on re-declare a chaque
 * evenement d'abonnement plutot qu'a la seule creation.
 *
 * La cle attendue par cet import est la cle *publique* de l'app Stripe du
 * projet RevenueCat, pas une cle secrete de l'API v2. Elle reste malgre tout
 * cote serveur : rien dans le navigateur n'a besoin d'appeler RevenueCat.
 */

const ENDPOINT = "https://api.revenuecat.com/v1/receipts";

export type RevenueCatErrorCode = "no_key" | "unauthorized" | "rejected" | "http" | "timeout";

export class RevenueCatError extends Error {
  code: RevenueCatErrorCode;
  constructor(code: RevenueCatErrorCode, message?: string) {
    super(message || code);
    this.code = code;
  }
}

export function revenueCatEnabled() {
  return Boolean(process.env.REVENUECAT_STRIPE_PUBLIC_KEY);
}

/** Un achat tel que RevenueCat l'attend : le compte a qui il appartient, et le
 * jeton Stripe qui lui permet d'aller lire l'abonnement a la source. */
export type StripePurchase = { appUserId: string; fetchToken: string };

type Party = { id: string; customer?: string | { id: string } | null; metadata?: Record<string, string> | null };
type SubscriptionLike = Party;
type CheckoutLike = Party & {
  mode?: string | null;
  status?: string | null;
  payment_status?: string | null;
  client_reference_id?: string | null;
};

function customerId(value: Party["customer"]): string {
  if (!value) return "";
  return typeof value === "string" ? value : value.id;
}

/** Une session de paiement unique (l'offre a vie) reellement encaissee. Un
 * paiement en attente n'est pas du revenu : on ne le declare pas. */
function oneOffPaid(checkout: CheckoutLike | null | undefined): checkout is CheckoutLike {
  return Boolean(checkout && checkout.mode === "payment" && checkout.status === "complete" && checkout.payment_status === "paid");
}

/** Quel achat declarer pour cet evenement, et sous quel identifiant de compte.
 *
 * L'identifiant envoye est celui du compte ScrollShow : c'est le seul stable.
 * Un identifiant client Stripe changerait de sens le jour ou le client est
 * recree, et RevenueCat garderait deux clients pour une seule personne.
 *
 * Sans compte identifiable, on ne declare rien : un achat rattache au mauvais
 * compte est pire qu'un achat manquant, parce qu'il donne des droits a
 * quelqu'un d'autre et qu'il ne se voit pas.
 */
export function purchaseToDeclare(input: {
  subscription?: SubscriptionLike | null;
  checkout?: CheckoutLike | null;
  userIdFor: (customer: string) => string | undefined;
}): StripePurchase | null {
  const { subscription, checkout, userIdFor } = input;
  // Un abonnement se declare par son identifiant, un achat unique par celui de
  // sa session de paiement : RevenueCat accepte les deux comme jeton.
  const source: Party | null = subscription || (oneOffPaid(checkout) ? checkout : null);
  if (!source?.id) return null;
  const customer = customerId(source.customer) || customerId(checkout?.customer);
  const appUserId =
    (customer ? userIdFor(customer) : undefined) ||
    source.metadata?.userId ||
    checkout?.metadata?.userId ||
    checkout?.client_reference_id ||
    "";
  return appUserId ? { appUserId, fetchToken: source.id } : null;
}

/** Envoie l'achat a RevenueCat. Leve : l'appelant decide si l'echec est grave. */
export async function postStripePurchase(purchase: StripePurchase, timeoutMs = 8000) {
  const key = process.env.REVENUECAT_STRIPE_PUBLIC_KEY;
  if (!key) throw new RevenueCatError("no_key");
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Platform": "stripe", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ app_user_id: purchase.appUserId, fetch_token: purchase.fetchToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new RevenueCatError("timeout", error instanceof Error ? error.message : "fetch failed");
  }
  if (response.status === 401 || response.status === 403) throw new RevenueCatError("unauthorized", "RevenueCat a refuse la cle de l'app Stripe");
  if (response.status === 400 || response.status === 404) {
    throw new RevenueCatError("rejected", `RevenueCat a refuse l'achat (${response.status}) ${(await response.text().catch(() => "")).slice(0, 200)}`);
  }
  if (!response.ok) throw new RevenueCatError("http", `revenuecat ${response.status}`);
  return response.json().catch(() => ({}) as unknown);
}

/** Declare l'achat sans jamais faire echouer l'appelant.
 *
 * Un webhook Stripe qui repond en erreur est rejoue, et le rejeu refait le
 * travail deja fait sur la base sans reparer une panne RevenueCat. Le revenu
 * vit dans Stripe : RevenueCat n'en est qu'un miroir, il ne doit jamais
 * bloquer un encaissement. La trace serveur est le rattrapage. */
export async function declareStripePurchase(purchase: StripePurchase | null | undefined) {
  if (!purchase || !revenueCatEnabled()) return false;
  try {
    await postStripePurchase(purchase);
    return true;
  } catch (error) {
    console.error("revenuecat_declare_failed", {
      appUserId: purchase.appUserId,
      fetchToken: purchase.fetchToken,
      code: error instanceof RevenueCatError ? error.code : "unknown",
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
