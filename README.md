# ScrollShow

SaaS indépendant : QG de recherche des comptes TikTok photo-slideshow.

Site : https://scrollshow.io

## Développement local

Lancer `npm run dev:local`, puis ouvrir http://localhost:3000/app/home. Les changements de code sont rechargés automatiquement. Les données sont conservées dans `.data/store.json`, séparément de la production ; le build de développement utilise `.next-local`.

Cette commande conserve les accès de lecture aux données TikTok configurés dans `.env.local` et désactive les paiements Stripe, les envois Resend et les tâches cron. Les connexions OAuth nécessitent des URL de retour locales autorisées chez le fournisseur. La publication TikTok nécessite un compte connecté et des médias accessibles par TikTok.
