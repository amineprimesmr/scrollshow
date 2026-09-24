# Recréation de TikTok avec images Pinterest — coûts, limites, prévisionnel (18 septembre 2026)

**[M]** = mesuré ce jour sur le test @domdavy (14 slides). **[H]** = hypothèse à re-mesurer.

## 1. Ce que coûte UNE recréation (14 slides)

| Poste | Coût | Source |
|---|---|---|
| Recherche Pinterest, 1 par slide, 20 images (Apify `silentflow/pinterest-scraper-ppr`, 0,002 $/image) | 0,56 $ ; **0,60 $ avec les recherches de correction** | [M] |
| Import du TikTok de référence (fournisseur de métriques) | ~0,002 $ | [M] doc coûts fournisseur |
| Rendu des 14 PNG (CPU Vercel, ~30 s) | ~0,001 $ | [H] |
| Stockage : 14 sources + 14 PNG ≈ 30 Mo | ~0,0007 $/mois | [H] tarif Blob |
| Sortie réseau quand TikTok tire les images (~21 Mo) | ~0,001 $ | [H] |
| LLM | **0 $ pour ScrollShow** — c'est l'abonnement Claude de l'utilisateur qui paie | règle projet |

**Pinterest = 99 % du coût.** Tout le reste est du bruit. C'est donc le seul poste à optimiser.

## 2. Pourquoi des images IA médiocres

Mesuré sur les 280 épingles ramenées : **60 % créées en 2026, 49 % avec ≤ 2 enregistrements**, et une
seule sur 280 se déclare « AI ». Pinterest est inondé de contenu généré, publié par de petits comptes
récents (souvent avec un lien d'affiliation) et jamais étiqueté. La recherche par mot-clé les remonte
en premier parce qu'ils sont frais et bourrés de mots-clés.

Signaux disponibles dans chaque résultat, sans appel supplémentaire :
`saves`, `createdAt`, `pinner.followerCount`, `domain`, `board.name`, `width/height`.

Filtre retenu (côté serveur, avant que l'agent voie quoi que ce soit) :
- rejeter `saves < 20` **et** créé depuis moins de 18 mois (garde les vieilles photos peu enregistrées) ;
- rejeter les domaines marchands/affiliés (`amazon.*`, `etsy`, `temu`, `shein`, boutiques) ;
- rejeter largeur < 700 px ; trier par `saves` décroissant.
Sur l'échantillon, ce filtre garde ~30 % des résultats → il faut demander 40–50 images pour en
montrer 12–15 bonnes. **Le coût par recherche passe de 0,04 $ à ~0,09 $.**

Leviers gratuits : mots-clés orientés photo réelle (« iphone photo », « candid », « pov », « film »,
jamais « aesthetic model ») ; règle dans le skill : l'agent rejette peau plastique / lumière studio ;
pouce vers le bas dans la banque = auteur Pinterest bloqué pour ce projet ; **« plus comme celle-ci »**
à partir d'une bonne épingle (épingles liées) — c'est la source la plus propre une fois la banque amorcée.

## 3. Pourquoi c'était long (≈ 50 min) et la cible

Les recherches prennent 3 s chacune [M]. Le temps est parti dans le travail fait **à la main** : mesurer
les textes des 14 slides, écrire les scripts, regarder 15 planches, corriger 5 slides.
Cible produit : import + plan automatique 10 s → 14 recherches en parallèle 10–15 s → l'agent choisit
(planches groupées, 4–5 appels) 2–3 min → rendu 20 s → contrôle 1 min = **4 à 6 min par TikTok**.

## 4. Limites dures

- **Côté utilisateur : l'abonnement Claude.** Une recréation = ~25 images regardées par l'agent. Un
  abonné Claude Pro en fera quelques-unes par jour, pas des centaines. « Des centaines de TikTok par
  jour par utilisateur » n'est pas atteignable par un agent conversationnel ; par **tous** les
  utilisateurs réunis, oui.
- Apify gratuit : 5 $/mois, **5 exécutions simultanées** [M]. Offres payantes à vérifier avant prod.
- Images originales parfois en HEIF, illisibles par sharp → repli 736 px [M] (3 slides sur 14).
- Rendu : pas d'emoji, polices latines seulement.
- Scraping Pinterest contraire à ses conditions ; images sous droit d'auteur → prévoir une procédure
  de retrait (l'URL source de chaque image est conservée).

## 5. Prévisionnel mensuel

Offres : 29 €/mois, 199 €/an (16,6 €/mois), **99 € à vie**.

Coût Pinterest par recréation selon le niveau d'optimisation :
- **Naïf** (aujourd'hui) : 0,60 $
- **Filtré qualité** (50 images/recherche) : ~1,25 $
- **Filtré + banque du projet** (60 % des slides servies par la banque après ~10 TikTok) [H] : ~0,50 $
- **+ cache partagé entre utilisateurs** (même niche = mêmes requêtes, 50 % de hits) [H] : ~0,25 $
- **+ scraper maison avec proxys** au lieu d'Apify (~0,0005 $/recherche) [H] : ~0,01 $

| Scénario | Recréations/mois | Naïf | Filtré+banque+cache | Scraper maison | Revenu mensuel approx. |
|---|---|---|---|---|---|
| 1 000 utilisateurs, 300/jour au total | 9 000 | 5 400 $ | 2 250 $ | ~90 $ | ~20 000 € |
| 3 000 utilisateurs, 1 000/jour | 30 000 | 18 000 $ | 7 500 $ | ~300 $ | ~60 000 € |
| 5 000 utilisateurs, 1/jour chacun | 150 000 | 90 000 $ | 37 500 $ | ~1 500 $ | ~100 000 € |

Par utilisateur à 1 TikTok/jour : naïf **18 $/mois (62 % d'un abonnement à 29 €)**, optimisé Apify
7,5 $, scraper maison 0,30 $.

**Le vrai danger : l'offre à vie à 99 €.** Un utilisateur à vie actif coûte 7,5 $/mois en Apify optimisé :
il est déficitaire au bout de 13 mois, pour toujours.

## 6. Décisions recommandées

1. Quota de recréations **par offre**, sur le modèle de `metrics-guard.ts` : mensuel 60/mois,
   annuel 40/mois, à vie 10/mois (puis recharge payante). Le compteur porte sur les **recherches
   payées**, pas sur les TikTok : la banque et le cache sont gratuits et illimités.
2. Banque d'abord, Pinterest ensuite ; cache partagé par requête normalisée (7 jours).
3. Filtre qualité côté serveur avant l'agent.
4. Démarrer sur Apify (zéro maintenance). **Au-delà de ~2 000 $/mois de facture, passer au scraper
   maison** derrière la même fonction, Apify restant le repli.
5. Registre d'usage + alerte quotidienne, comme pour les métriques.

## 7. Règle de sélection des images (décision d'Amine, 18 septembre)

On recrée **le format**, pas la photo. Identiques à l'original : nombre de slides, format de chaque
slide, textes (place, taille, style), rythme. **L'image, elle, n'a pas à ressembler à celle de
l'original** : elle doit, dans cet ordre,
1. être belle et vraie (photo réelle, esthétique de la niche — jamais une image IA plastique) ;
2. illustrer l'idée du texte de la slide (« 8+ hours sleep » = une ambiance de nuit, pas forcément
   des jambes sur une terrasse) ;
3. laisser un espace calme là où le texte se pose ;
4. rester cohérente avec les autres slides (même univers, même lumière, même type de personnage).

Conséquence sur les coûts : on ne cherche plus « la même pose », donc la **banque du projet sert bien
plus souvent** (une bonne photo de plage sert à dix textes différents) et une recherche par *thème*
(8–10 par niche) remplace une recherche par slide. L'hypothèse « 60 % de slides servies par la
banque » devient prudente ; viser 80 % après une vingtaine de TikTok.

## 8. Mise à jour du soir : Pinterest en direct, 0 $

Apify ne faisait que relayer la recherche publique de Pinterest. Appelée directement
(`lib/image-bank.ts`, en-tête `X-Pinterest-PWS-Handler` obligatoire) : 48–50 images en 1–3,5 s,
**gratuit**, vérifié depuis un Mac et depuis Vercel (iad1, 15 requêtes sur 15). Le poste « Pinterest »
des sections 1 et 5 tombe donc à ~0 $ ; les colonnes Apify ne valent plus que comme plan de secours
si Pinterest bloque un jour les IP de Vercel (parade intermédiaire : proxy ≈ 0,0005 $/recherche).
Deuxième test (@victorchris55, 6 slides) : ~10 min, 0 $. Troisième (@theappofsigmamax, infographies) :
généré avec Higgsfield via son MCP, 2 crédits/image, 16 crédits avec deux régénérations — à la charge
de l'utilisateur. Garde-fous en place : 300 recherches et 400 ajouts par utilisateur et par jour,
cache partagé 6 h par requête.
