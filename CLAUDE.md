# ScrollShow — règles projet

## Liquid Glass (obligatoire pour toute UI)

Le studio et le site utilisent un design system « Liquid Glass » (iOS 26). Toute
nouvelle surface de **chrome** doit l'utiliser ; ne jamais réinventer un flou ou
un `backdrop-filter` à la main.

- **Source** : `app/liquid-glass.css` (primitives + application aux classes
  existantes), tokens `--lg-*` dans `app/theme.css` (clair et sombre), filtre de
  réfraction dans `components/LiquidGlassDefs.tsx` (déjà monté dans
  `StudioShell` et `Landing`).
- **Ordre d'import** : `liquid-glass.css` doit être importé **après**
  `studio.css` / `landing.css` (il surcharge). Une nouvelle page hors studio
  l'importe après sa propre feuille.

### Où mettre du verre (chrome = contrôles flottants)
Barres collantes, sidebars/rails, menus et popovers, feuilles/modales et leur
scrim, contrôles segmentés, boutons fantômes, interrupteurs, pilules
flottantes, bannières, chrome mobile fixe.

### Où ne PAS en mettre (contenu)
Cartes de contenu, tableaux, formulaires, listes, cartes de post, images.
Le contenu reste opaque (`var(--ss-card)`), sinon rien n'est lisible.

### Comment
- Classe utilitaire : `.lg` (panneau), `.lg--flat` (barre, sans ombre portée),
  `.lg--lens` (petite pilule avec réfraction de bord sur Chromium), `.lg-press`
  (compression ressort au clic).
- Pour styliser une classe existante, ajouter une règle dans
  `liquid-glass.css` qui reprend le même motif : fond
  `rgb(var(--lg-rgb) / alpha)`, `backdrop-filter: blur(var(--lg-blur))
  saturate(var(--lg-sat))`, reflets via les `box-shadow` inset basés sur
  `--lg-hi` / `--lg-hi-a` et ombre via `--lg-shade` / `--lg-shade-a`.
- Toujours mettre `-webkit-backdrop-filter` avec `backdrop-filter`.
- Réfraction : uniquement sous `html.lg-refract` et seulement sur de petites
  surfaces (pilule, pastille de segment, menu). Jamais sur une sidebar ou un
  grand panneau (coût GPU).
- Élément collant : `position: sticky` **dans** `.ss-main__body` (c'est le
  conteneur qui défile), l'en-tête `.ss-top` y est déjà. Sur la page
  calendrier c'est `.ss-cal-bar` qui est collante, pas `.ss-top`.
- Ne jamais coder une couleur sombre en dur (`rgb(20 20 22 / .9)`) : utiliser
  les tokens pour que clair et sombre marchent.
- Micro-détails attendus : `transition: transform 0.34s cubic-bezier(0.2, 1.4,
  0.4, 1)` et `scale(0.96)` au `:active`, animation `lg-pop` à l'apparition
  d'un menu ou d'une pastille, rayons 999px pour les pilules et 24px pour les
  feuilles.
- Respecter `prefers-reduced-transparency` et `prefers-reduced-motion` (déjà
  gérés globalement, ne pas les contourner).

### Vérification
Tester clair **et** sombre (`document.documentElement.dataset.theme`), et
vérifier dans Chrome que `html.lg-refract` est présent et que
`getComputedStyle(el).backdropFilter` renvoie bien le filtre.

## Calendrier
`components/studio/CalendarView.tsx` : une seule `PostCard` pour jour/semaine/
mois, navigation par flèches selon la vue, résumé calculé sur la période
affichée uniquement. Garder ces invariants si on ajoute une vue.

## Onboarding et profil business
Après inscription (email ou Google) tout le monde passe par `/onboarding` :
prénom + entreprise + logo, puis lien du business analysé côté serveur par
`lib/business-analyzer.ts` (site, Shopify, App Store, Play Store, profil
TikTok ; enrichi via Monid quand `MONID_API_KEY` est là), puis branchement
Claude / Cursor / Codex, puis « comment tu nous as connu ». Pas de question
objectif ni rythme : par défaut `goal = "sell"` et `cadence = "daily"`.
- Le résultat vit dans `User.business` (`BusinessProfile`) et est exposé au
  MCP via `whoami`. Toute génération de contenu doit s'appuyer dessus.
- Le flag `onboarded` est dans le JWT de session ; `app/app/layout.tsx`
  redirige vers l'onboarding s'il manque. Refaire passer un utilisateur par
  l'onboarding = lien `/onboarding?next=…` (les réglages > Compte l'ont).
- Le skill agent vit dans `.cursor/skills/scrollshow/SKILL.md` et est servi tel quel
  en `public/skill.md` (l'onboarding le fait installer dans `~/.claude/skills`).
  Modifier l'un = recopier l'autre.
- Monid : clé serveur unique `MONID_API_KEY` (jamais côté client), partagée par
  tous les utilisateurs ; sans elle tout se dégrade proprement (stats TikTok
  basiques, pas de vues moyennes ni de check shadowban).
- L'analyseur n'utilise aucun LLM : métadonnées, signaux concrets, réseaux
  détectés. Ne pas ajouter d'appel IA côté serveur sans clé dédiée.

## Dev local
Le serveur de dev tourne souvent déjà sur le port 3000 depuis une autre
session (même dossier, hot reload) : ouvrir `http://localhost:3000` dans le
Chrome de l'utilisateur, qui est déjà connecté (compte « Dev Local »), plutôt
que de relancer un serveur ou tenter de se connecter.
