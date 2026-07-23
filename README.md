# Zen Coffee Lab — e-commerce React/Vite

Refonte SSR bilingue du site Zen Coffee Lab, sans dépendance à WordPress au runtime. Le projet utilise React Router en Framework Mode avec Vite, Cloudflare Workers, Supabase (PostgreSQL/Auth/Storage), Stripe Checkout, Sendcloud et Resend.

## Démarrage local

Prérequis : Node.js 24+ et npm.

```bash
npm install
cp .env.example .env
npm run dev
```

Sans identifiants externes, le développement utilise automatiquement le catalogue de démonstration, des devis pondéraux simulés, le paiement simulé et un administrateur local. Ces quatre modes sont refusés si `NODE_ENV=production`.

Commandes utiles :

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run check
```

## Architecture

- `app/routes` : pages SSR françaises, équivalents `/en`, ressources SEO et actions serveur.
- `app/domain` : montants entiers en centimes, poids en grammes, colisage déterministe et schémas Zod.
- `app/services` : checkout Stripe, Sendcloud, factures PDF privées et file Resend.
- `supabase/migrations` : schéma, RLS, séquences immuables et fonctions atomiques de stock.
- `scripts/import-wordpress.ts` : import WooCommerce/WPML reproductible, simulation par défaut.
- `tests` : tests unitaires, intégration des frontières d’accès et parcours Playwright.

Les loaders publics projettent explicitement le catalogue : `internalCostCents` vaut toujours zéro et seules les offres de l’audience autorisée sont sérialisées. Les données complètes passent uniquement par la clé de service côté serveur. Un administrateur doit avoir le rôle `admin` et une session Supabase au niveau MFA `aal2`.

Le back-office `/admin` gère le catalogue bilingue, variantes, stocks, coûts, offres public/pro, commandes, remboursements, étiquettes, emballages, demandes professionnelles, pages, FAQ et Conseils. Les pages publiques anonymes sont servies en SSR avec un cache CDN court ; toute requête authentifiée, professionnelle, panier ou commande est explicitement `private, no-store`.

## Base de données

Appliquer la migration sur un projet Supabase de test avant tout environnement de production :

```bash
npx supabase link --project-ref <preview-project-ref>
npx supabase db push
```

La finalisation d’une vente intervient uniquement dans `finalize_paid_order`, après un événement Stripe signé. La fonction verrouille la commande, décrémente la réservation et crée le numéro de facture dans la même transaction. La tâche `/api/cron/commerce` libère les réservations expirées et reprend les notifications.

## Configuration externe

- Stripe : webhook `/api/webhooks/stripe`, événements `checkout.session.completed`, `checkout.session.expired` et `charge.refunded`.
- Sendcloud : prestataire unique pour les nouveaux devis et achats d’étiquettes via l’API v3. Renseigner `SENDCLOUD_PUBLIC_KEY` et `SENDCLOUD_SECRET_KEY`. Configurer le webhook sur `https://<domaine-production>/api/webhooks/sendcloud?secret=<SENDCLOUD_WEBHOOK_SECRET>`. Une erreur Sendcloud bloque l’achat ; aucun repli Shippo n’est effectué. L’annulation utilise également l’API v3.
- Shippo : désactivé pour les nouveaux devis et les nouvelles étiquettes. Les clés et le webhook restent temporairement disponibles uniquement pour suivre ou rembourser les étiquettes historiques déjà achetées.
- Points relais : temporairement masqués jusqu’à l’association des identifiants de points relais avec les options Sendcloud v3. La livraison à domicile Sendcloud reste active.
- Franco : `FREE_SHIPPING_FR_CENTS=7500` et `FREE_SHIPPING_EU_UK_CENTS=15000`, distincts par environnement.
- Resend : domaine d’envoi validé et `RESEND_FROM_EMAIL` ; toute communication passe par l’outbox.
- GA4 : uniquement `VITE_GA_MEASUREMENT_ID`, chargé après consentement. Aucun événement ne doit contenir d’e-mail, téléphone, adresse ou nom.

Voir [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) et [docs/MIGRATION.md](docs/MIGRATION.md) avant la mise en ligne.

## Points à valider avant production

- coûts internes et tarifs/minimums professionnels ;
- adresse expéditeur, emballages, options Sendcloud et données douanières ;
- mentions légales, régime de TVA, médiateur, codes tarifaires/origines ;
- contenus et traductions manuelles complètes ;
- licences Migra/Decalotype et médias définitifs ;
- matrice des anciennes URL issue du rapport d’import.

Le rapport de simulation courant est `migration-report-dry-run.json`. Il ne remplace pas la validation Staging avec accès WooCommerce authentifié, Stripe/Sendcloud de test et les contenus légaux définitifs.
