#!/usr/bin/env bash
# Bascule la facturation ScrollShow du compte Stripe `Process` vers le compte
# dedie `Scrollshow` (acct_1UE4ENQSj8XJlvHm), en une passe.
#
# Pourquoi un script et pas quatre commandes : les identifiants de prix et la
# cle secrete doivent changer ENSEMBLE. Un prix du nouveau compte avec la cle de
# l'ancien fait echouer `prices.retrieve`, et le checkout repond
# `billing_price_mismatch` a tous les acheteurs. On verifie donc tout avant
# d'ecrire quoi que ce soit, puis on ecrit tout d'un coup.
#
# Les secrets sont lus au clavier, jamais en argument : rien n'atterrit dans
# l'historique du shell.
#
#   bash scripts/switch-stripe-account.sh
set -euo pipefail

ACCOUNT="acct_1UE4ENQSj8XJlvHm"
PRICE_MONTHLY="price_1UE4U6QSj8XJlvHmkXB3Hs5U"
PRICE_LIFETIME="price_1UE4VKQSj8XJlvHmm3KvQaBW"
PRICE_YEARLY="price_1UE4WJQSj8XJlvHmO34ZBTuT"

die() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
ok()  { printf '  \033[32mok\033[0m  %s\n' "$*"; }

command -v python3 >/dev/null || die "python3 est requis."
command -v curl    >/dev/null || die "curl est requis."

printf 'Bascule ScrollShow vers le compte Stripe %s\n\n' "$ACCOUNT"
printf 'Colle les valeurs (rien ne s affiche) :\n'
printf '  cle secrete Stripe du compte Scrollshow (sk_live_...) : '; read -rs SK;   echo
printf '  secret du webhook Stripe (whsec_...)                  : '; read -rs WH;   echo
printf '  cle publiable Stripe (pk_live_...)                    : '; read -rs PK;   echo
printf '  cle publique de l app Stripe RevenueCat (strp_...)    : '; read -rs RC;   echo
echo

[[ $SK == sk_* ]]    || die "La cle secrete doit commencer par sk_."
[[ $WH == whsec_* ]] || die "Le secret de webhook doit commencer par whsec_."
[[ $PK == pk_* ]]    || die "La cle publiable doit commencer par pk_."
[[ -n $RC ]]         || die "La cle RevenueCat est vide."

stripe_get() { curl -sS -u "$SK:" "https://api.stripe.com/v1/$1"; }

echo "Verifications avant ecriture"

stripe_get account | python3 -c '
import json,sys
want = sys.argv[1]
body = json.load(sys.stdin)
if "error" in body: sys.exit("  Stripe a refuse la cle : " + body["error"].get("message",""))
got = body.get("id")
if got != want: sys.exit(f"  La cle appartient a {got}, pas a {want}. Mauvais compte : rien na ete ecrit.")
' "$ACCOUNT" || die "Verification du compte echouee."
ok "la cle appartient bien a $ACCOUNT"

check_price() {
  local id="$1" cents="$2" interval="$3"
  stripe_get "prices/$id" | python3 -c '
import json,sys
pid, cents, interval = sys.argv[1], int(sys.argv[2]), sys.argv[3]
p = json.load(sys.stdin)
if "error" in p: sys.exit(f"  {pid} introuvable dans ce compte : " + p["error"].get("message",""))
if not p.get("active"):              sys.exit(f"  {pid} est inactif.")
if p.get("currency") != "eur":       sys.exit(f"  {pid} nest pas en EUR ({p.get(chr(39)+chr(39))}).")
if p.get("unit_amount") != cents:    sys.exit(f"  {pid} vaut {p.get('"'"'unit_amount'"'"')} et non {cents}.")
r = p.get("recurring")
if interval == "none":
    if r: sys.exit(f"  {pid} est recurrent alors quil doit etre ponctuel.")
else:
    if not r or r.get("interval") != interval or r.get("interval_count") != 1:
        sys.exit(f"  {pid} nest pas un {interval} simple.")
' "$id" "$cents" "$interval" || die "Verification de prix echouee."
  ok "$id — $((cents / 100)) EUR ${interval}"
}

# Les memes controles que app/api/stripe/checkout/route.ts : une erreur se voit
# ici, pas en production sur un acheteur.
check_price "$PRICE_MONTHLY"  2900  month
check_price "$PRICE_LIFETIME" 9900  none
check_price "$PRICE_YEARLY"   19900 year

echo
echo "Ecriture des variables Vercel"

# `vercel env add` peut sortir en 0 sans rien creer (vu sur la cible preview).
# On ne fait donc pas confiance a son code de retour : on relit la liste et on
# n'annonce que les cibles reellement presentes. Un silence non detecte laisse
# un environnement sans cles de paiement, ce qui ne se voit qu'au premier achat.
set_env() {
  local name="$1" value="$2" written=""
  for target in production preview development; do
    npx --yes vercel env rm "$name" "$target" --yes >/dev/null 2>&1 || true
    printf '%s' "$value" | npx --yes vercel env add "$name" "$target" >/dev/null 2>&1 || true
    if npx --yes vercel env ls "$target" 2>/dev/null | grep -q "^ *$name "; then
      written="$written $target"
    else
      MISSING="$MISSING $name/$target"
    fi
  done
  [[ -n $written ]] || die "$name n'a ete ecrit sur aucun environnement."
  ok "$name —$written"
}
MISSING=""

set_env STRIPE_SECRET_KEY                  "$SK"
set_env STRIPE_WEBHOOK_SECRET              "$WH"
set_env NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY "$PK"
set_env REVENUECAT_STRIPE_PUBLIC_KEY       "$RC"
set_env STRIPE_PRICE_PRO_MONTHLY           "$PRICE_MONTHLY"
set_env STRIPE_PRICE_LIFETIME              "$PRICE_LIFETIME"
set_env STRIPE_PRICE_YEARLY                "$PRICE_YEARLY"


if [[ -n $MISSING ]]; then
  printf '\n\033[33mCibles non ecrites :%s\033[0m\n' "$MISSING"
  printf 'La production est ce qui compte ; verifie ci-dessus quelles cibles manquent.\n'
  printf 'Une cible preview attend de toute facon les cles de TEST : le checkout refuse\n'
  printf 'une cle live en preview (preview_requires_test_stripe).\n'
fi

echo
echo "Mise a jour de .env.local"
python3 - "$SK" "$WH" "$PK" "$RC" "$PRICE_MONTHLY" "$PRICE_LIFETIME" "$PRICE_YEARLY" <<'PY'
import pathlib, sys
sk, wh, pk, rc, monthly, lifetime, yearly = sys.argv[1:8]
values = {
    "STRIPE_SECRET_KEY": sk,
    "STRIPE_WEBHOOK_SECRET": wh,
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY": pk,
    "REVENUECAT_STRIPE_PUBLIC_KEY": rc,
    "STRIPE_PRICE_PRO_MONTHLY": monthly,
    "STRIPE_PRICE_LIFETIME": lifetime,
    "STRIPE_PRICE_YEARLY": yearly,
}
path = pathlib.Path(".env.local")
lines = path.read_text().splitlines() if path.exists() else []
seen = set()
for i, line in enumerate(lines):
    name = line.split("=", 1)[0].strip()
    if name in values:
        lines[i] = f"{name}={values[name]}"
        seen.add(name)
for name, value in values.items():
    if name not in seen:
        lines.append(f"{name}={value}")
path.write_text("\n".join(lines) + "\n")
path.chmod(0o600)
print("  ok  .env.local")
PY

cat <<'NEXT'

Termine. Il reste trois choses, dans cet ordre :

  1. Redeployer pour que la production prenne les nouvelles variables :
       npx vercel --prod

  2. Desactiver l'ancien webhook du compte Process, qui pointe encore sur
     https://scrollshow.io/api/stripe/webhook. Sa signature n'est plus celle
     attendue : il repondrait 400 en boucle jusqu'a ce que Stripe le desactive
     et envoie des alertes. A faire APRES le redeploiement, pas avant.
       Stripe > compte Process > Developpeurs > Webhooks > desactiver

  3. Importer les abonnes deja payants dans RevenueCat :
       npm run revenuecat:backfill              # a blanc
       npm run revenuecat:backfill -- --apply

Le webhook du nouveau compte (we_1UE4lhQSj8XJlvHm3c5qRFKR) est deja cree et
actif, avec les cinq evenements que le code traite.
NEXT
