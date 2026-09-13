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

export type RevenueCatErrorCode = "no_key" | "invalid_key" | "unauthorized" | "rejected" | "http" | "timeout";

const ERROR_MESSAGES: Record<RevenueCatErrorCode, string> = {
  no_key: "REVENUECAT_STRIPE_PUBLIC_KEY manquante : renseigner la cle publique strp_ de l'app Stripe RevenueCat.",
  invalid_key: "REVENUECAT_STRIPE_PUBLIC_KEY invalide : utiliser la cle publique strp_ de l'app Stripe RevenueCat, pas une cle Stripe ou une cle secrete RevenueCat v2.",
  unauthorized: "RevenueCat a refuse la cle de l'app Stripe. Verifier la cle et le projet RevenueCat.",
  rejected: "RevenueCat a refuse l'achat. Verifier le compte Stripe lie a l'app et l'environnement du paiement.",
  http: "Le service RevenueCat a renvoye une erreur HTTP. La declaration sera retentee.",
  timeout: "La requete RevenueCat a echoue ou depasse son delai. La declaration sera retentee.",
};

export class RevenueCatError extends Error {
  code: RevenueCatErrorCode;
  status?: number;
  constructor(code: RevenueCatErrorCode, message?: string, status?: number) {
    super(message || ERROR_MESSAGES[code]);
    this.code = code;
    this.status = status;
  }
}

/** Les messages fournisseur peuvent contenir le recu, le client ou une cle.
 * Les journaux utilisent uniquement ces diagnostics controles, jamais error.message. */
export function revenueCatErrorDetails(error: unknown, fallback: "unknown" | "unavailable" = "unknown") {
  if (!(error instanceof RevenueCatError) || !Object.hasOwn(ERROR_MESSAGES, error.code)) {
    return { code: fallback, message: "La declaration RevenueCat a echoue. Verifier la configuration et la disponibilite du service." };
  }
  const status = error.status;
  return {
    code: error.code,
    message: ERROR_MESSAGES[error.code],
    ...(typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599 ? { status } : {}),
  };
}

export function revenueCatEnabled() {
  return Boolean(process.env.REVENUECAT_STRIPE_PUBLIC_KEY?.trim());
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
  const key = process.env.REVENUECAT_STRIPE_PUBLIC_KEY?.trim();
  if (!key) throw new RevenueCatError("no_key");
  if (!/^strp_[A-Za-z0-9_]+$/.test(key)) throw new RevenueCatError("invalid_key");
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Platform": "stripe", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ app_user_id: purchase.appUserId, fetch_token: purchase.fetchToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new RevenueCatError("timeout");
  }
  if (response.status === 401 || response.status === 403) throw new RevenueCatError("unauthorized", undefined, response.status);
  if (response.status === 400 || response.status === 404) {
    throw new RevenueCatError("rejected", undefined, response.status);
  }
  if (!response.ok) throw new RevenueCatError("http", undefined, response.status);
  return response.json().catch(() => ({}) as unknown);
}

/** Declare l'achat sans jamais faire echouer l'appelant.
 *
 * Un webhook Stripe qui repond en erreur est rejoue, et le rejeu refait le
 * travail deja fait sur la base sans reparer une panne RevenueCat. Le revenu
 * vit dans Stripe : RevenueCat n'en est qu'un miroir, il ne doit jamais
 * bloquer un encaissement. La trace serveur est le rattrapage. */
export async function declareStripePurchase(purchase: StripePurchase | null | undefined) {
  if (!purchase) return false;
  try {
    await postStripePurchase(purchase);
    return true;
  } catch (error) {
    console.error("revenuecat_declare_failed", revenueCatErrorDetails(error));
    return false;
  }
}
