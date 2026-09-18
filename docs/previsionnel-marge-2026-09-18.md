# Prévisionnel de marge par abonnement — 18 septembre 2026

Objectif d'Amine : **≥ 80 % de bénéfice net par abonnement** avec TikHub en direct.
Prix actuels (`lib/plans.ts`) : 29 €/mois · 199 €/an (16,58 €/mois) · 99 € à vie.
Hypothèse : prix HT (B2B). En TTC (TVA 20 %), retirer 17 % du revenu : les conclusions ne changent pas.
Tous les coûts sont en dollars ≈ euros (parité prudente).

## 1. Coût variable par abonné actif et par mois

Profil « typique » : 20 comptes suivis, actif 10 jours/mois, 2 recherches/semaine, 1 import initial
amorti sur 12 mois, shadowban 1×/semaine. Avec les garde-fous en place (cache partagé, 2 pages par
ouverture, budget 120 appels/jour).

| Poste | Typique | Pire cas (au plafond 120/jour, tous les jours) | Source |
|---|---|---|---|
| TikHub direct (0,001 $/appel) | ~340 appels → **0,34 $** | 3 600 appels → **3,60 $** | docs/couts-fournisseur |
| — avec le dégressif journalier (≥ 1 000 abonnés) | 0,24 $ | 1,80 $ | −30 % à −50 % |
| Vercel (fonctions, bande passante, OCR) | ~0,10 $ | ~0,30 $ | Active CPU 0,128 $/h |
| Stripe (1,5 % + 0,25 € carte UE ; 2,9 % hors UE) | 0,70 € | 0,70 € | |
| RevenueCat (1 % au-delà de 2 500 $/mois de revenu) | 0,29 € | 0,29 € | |
| Blob médias, emails | ~0,02 $ | ~0,05 $ | |
| **Total variable** | **≈ 1,45 €** | **≈ 4,95 €** | |

Pour comparaison, via Monid (0,0015 $/appel) : typique 1,62 €, pire cas 6,75 € → le pire cas
passe **sous** 80 % (6,75 / 29 = 23 % de coût). C'est la seule raison de basculer en direct.

## 2. Coûts fixes mensuels

| | Jusqu'à ~500 abonnés | 500–5 000 |
|---|---|---|
| Vercel Pro | 20 $ | 20 $ + usage inclus ci-dessus |
| Neon (Launch → Scale) | 19 $ | 69 $ |
| Resend (au-delà de 3 000 emails) | 0 | 20 $ |
| Domaine, divers | 5 $ | 5 $ |
| **Total fixe** | **≈ 45 $** | **≈ 115 $** |

## 3. Marge nette par abonnement

| Offre | Revenu / mois | Coût typique | Marge typique | Coût pire cas | Marge pire cas |
|---|---|---|---|---|---|
| **Mensuel 29 €** | 29,00 | 1,45 | **95 %** | 4,95 | **83 %** ✅ |
| **Annuel 199 €** | 16,58 | 1,45 | **91 %** | 4,95 | **70 %** ⚠️ |
| **À vie 99 €** (sur 24 mois) | 4,13 | 1,45 | **65 %** ❌ | 4,95 | **négatif** ❌ |

Le fournisseur n'est pas le problème : **l'offre à vie l'est**. Un abonné à vie coûte ~1,45 €/mois
pendant des années pour 99 € une fois : il passe sous 80 % dès le 14ᵉ mois et perd de l'argent
au pire cas dès le 20ᵉ.

## 4. Prévisionnel mensuel (100 % mensuel à 29 € HT, usage typique, TikHub direct)

| Abonnés | Revenu | Variable | Fixe | **Net** | **Marge** |
|---|---|---|---|---|---|
| 100 | 2 900 € | 145 € | 45 € | **2 710 €** | **93 %** |
| 500 | 14 500 € | 700 € | 45 € | **13 755 €** | **95 %** |
| 1 000 | 29 000 € | 1 350 € | 115 € | **27 535 €** | **95 %** |
| 5 000 | 145 000 € | 6 400 € | 115 € | **138 485 €** | **96 %** |

Même scénario si **tout le monde** était au plafond d'appels tous les jours (irréaliste) :
1 000 abonnés → coût variable ≈ 3 300 € (dégressif TikHub) → marge **88 %**.
Mix réaliste 60 % mensuel / 35 % annuel / 5 % à vie, usage typique : marge **≈ 92 %**.

## 5. Ce qu'il faut décider / faire pour tenir les 80 % dans tous les cas

1. **Supprimer l'offre à vie à 99 €**, ou la passer à ≥ 299 € avec un budget d'appels réduit
   (40/jour). À 99 € elle ne peut pas tenir 80 % au-delà d'un an.
2. **Budget d'appels par offre** (une ligne de code, `METRICS_USER_DAILY_LIMIT` devient par plan) :
   mensuel 120/jour · annuel 80/jour · à vie 40/jour. Pire cas annuel : 80 × 30 × 0,001 = 2,40 $ →
   marge 79–85 % même au plafond.
3. **Plafond mensuel** en plus du journalier (ex. 1 500 appels/mois) : borne le pire cas à 1,50 $.
4. **Comptes connectés → API officielle TikTok (gratuite)** pour leurs compteurs : moins d'appels
   payants sur les comptes que l'utilisateur possède.
5. **Bascule TikHub direct** (−33 % immédiat) et lecture hebdomadaire de `npm run metrics:usage`.
6. Surveiller le taux de cache partagé : chaque 10 % d'appels évités = ~0,03 €/abonné/mois.

## 6. Ce que ce prévisionnel ne compte pas
Ton temps, le marketing, le support, les impôts, les remboursements, les impayés (~2–3 % en SaaS),
et la TVA si tes prix sont TTC. Avec tout ça, un SaaS à 29 € et ~1,5 € de coût technique reste
très largement au-dessus de 80 % de marge brute ; la marge **nette** finale dépend surtout de ce
que tu dépenses pour acquérir un client (CAC), pas de TikHub.
