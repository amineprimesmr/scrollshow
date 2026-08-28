#!/bin/bash
# Installe le TIKTOK_CLIENT_SECRET en production a partir du presse-papier.
# Copie le secret sur la page TikTok (Cmd+C), puis lance ce script.
set -u
V=/opt/homebrew/Cellar/vercel/50.31.1/libexec/lib/node_modules/vercel/dist/vc.js

S=$(pbpaste 2>/dev/null | tr -d '[:space:]')

if [ -z "$S" ]; then
  echo ""
  echo "Presse-papier vide."
  echo "Va sur la page TikTok, selectionne le Client secret, Cmd+C, puis relance."
  exit 1
fi

if [ ${#S} -lt 16 ] || [ ${#S} -gt 128 ]; then
  echo ""
  echo "Le presse-papier ne ressemble pas a un secret (${#S} caracteres)."
  echo "Recopie le Client secret sur la page TikTok, puis relance."
  exit 1
fi

echo ""
echo "Secret detecte : ${S:0:4}$(printf '%*s' $(( ${#S} - 8 )) '' | tr ' ' '.')${S: -4}  (${#S} caracteres)"
echo "Installation en production..."

node "$V" env rm TIKTOK_CLIENT_SECRET --yes >/dev/null 2>&1 || true
if printf "%s" "$S" | node "$V" env add TIKTOK_CLIENT_SECRET production >/dev/null 2>&1; then
  echo ""
  echo "OK. Dis 'ok' a Claude, il deploie et teste."
else
  echo ""
  echo "Echec. Passe par la page web Vercel."
fi
unset S
