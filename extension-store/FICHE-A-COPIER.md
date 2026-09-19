# Fiche Chrome Web Store — à copier-coller

Console : https://chrome.google.com/webstore/devconsole → **Éléments** → **Nouvel élément**.
Chrome interdit à toute extension (donc à Claude) d'agir sur ces pages : à remplir à la main, ~5 minutes.

## 0. Avant (onglet Paramètres)
- **Nom à afficher de l'éditeur** : `ScrollShow`
- **Adresse e-mail de contact** : ajoute-la puis clique le lien de vérification reçu (obligatoire pour publier).

## 1. Téléverser
Fichier : `extension-store/scrollshow-extension-1.0.1.zip`

## 2. Fiche du Store (Store listing)
- **Langue** : English (la fiche anglaise est lue partout ; ajoute le français ensuite si tu veux)
- **Description** :

```
ScrollShow runs your TikTok slideshow research inside your own TikTok.

Type a keyword in ScrollShow. The extension opens the TikTok photo search in a small window of your own browser, reads the results TikTok shows you, sends them to your ScrollShow account, and closes the window. You get every carousel with its real numbers: views, likes, comments, shares.

Why an extension
• Real results on every keyword — the ones you see on tiktok.com when you are signed in
• Dozens of carousels per search, in seconds
• Sort the wall by views, likes, comments, shares or date, then save the winners to your library

Private by design
• It only acts when you start a search from ScrollShow
• It is only active on TikTok search pages it opened itself
• It never reads your messages, credentials, cookies or browsing history
• Results go to your ScrollShow account and nowhere else
• TikTok login prompts and captchas are never bypassed

Requires a ScrollShow account: https://scrollshow.io
```

- **Catégorie** : Productivity → Workflow & Planning (ou « Outils »)
- **Icône** : `icone-128.png`
- **Captures d'écran** : `capture-1-1280x800.png`, `capture-2-1280x800.png`
  (ajoute si tu veux une vraie capture du mur de Recherche en 1280×800)
- **Petite vignette promotionnelle** : `vignette-440x280.png`
- **Site officiel** : `https://scrollshow.io`
- **URL d'assistance** : `https://scrollshow.io/app/support`

## 3. Confidentialité (Privacy practices)
- **Objectif unique (Single purpose)** :
```
Run the user's ScrollShow keyword searches inside their own TikTok tab and deliver the public search results to their ScrollShow account.
```
- **Justification — tabs** :
```
Opens the TikTok search in a small window when the user starts a search from ScrollShow, and closes that window when the collection is finished.
```
- **Justification — autorisation d'hôte (host permissions)** :
```
https://www.tiktok.com/search/* — read the public search results TikTok displays to the signed-in user, only in a window the extension opened itself (marked in the URL fragment).
https://scrollshow.io/* and http://localhost:3000/* — receive the search request from the ScrollShow web app and deliver the results to the user's ScrollShow account. No other host is contacted.
```
- **Utilisez-vous du code distant ?** : **Non** (No, I am not using remote code)
- **Utilisation des données** — coche uniquement : **Contenu du site Web (Website content)**
  Ne coche PAS : informations personnelles, santé, finances, authentification, communications, localisation, historique Web, activité de l'utilisateur.
- **Certifications** : coche les trois (pas de vente à des tiers, pas d'usage sans rapport avec l'objectif unique, pas d'usage pour la solvabilité/le prêt).
- **URL des règles de confidentialité** : `https://scrollshow.io/privacy#extension`

## 4. Distribution
- **Visibilité** : Publique · **Régions** : toutes · **Tarif** : gratuit

## 5. Envoyer
« Envoyer pour examen ». Délai habituel : 1 à 7 jours (les extensions avec accès à un site tiers sont parfois relues à la main).
Quand c'est validé : donne l'URL du Store à Claude, qui remplace la page `/extension` par le bouton « Ajouter à Chrome ».
