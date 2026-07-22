# Zen Coffee Lab — e-commerce React/Vite

Refonte SSR bilingue du site Zen Coffee Lab, sans dépendance à WordPress au runtime. Le projet utilise React Router en Framework Mode avec Vite et le preset Vercel officiel, Supabase (PostgreSQL/Auth/Storage), Stripe Checkout, Shippo et Resend.

## Démarrage local

Prérequis : Node.js 24+ et npm.

```bash
npm install
cp .env.example .env
npm run dev
```

Sans identifiants externes, le développement utilise automatiquement le catalogue de démonstration, les devis pondéraux Shippo simulés, le paiement simulé et un administrateur local. Ces quatre modes sont refusés si `NODE_ENV=production`.

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
- `app/services` : checkout Stripe, Shippo, factures PDF privées et file Resend.
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
- Shippo : webhook `/api/webhooks/shippo?secret=<SHIPPO_WEBHOOK_SECRET>`, événements de transaction et de suivi. L’admin achète les étiquettes après paiement.
- Points relais : `COLISSIMO_PICKUP_API_KEY` active la recherche officielle Colissimo. `COLISSIMO_PICKUP_PARTNER_CLIENT_CODE` est facultatif et réservé aux comptes partenaires. Le relais est revalidé côté serveur puis figé avec la commande.
- Franco : `FREE_SHIPPING_FR_CENTS=7500` et `FREE_SHIPPING_EU_UK_CENTS=15000`, distincts par environnement.
- Resend : domaine d’envoi validé et `RESEND_FROM_EMAIL` ; toute communication passe par l’outbox.
- GA4 : uniquement `VITE_GA_MEASUREMENT_ID`, chargé après consentement. Aucun événement ne doit contenir d’e-mail, téléphone, adresse ou nom.

Voir [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) et [docs/MIGRATION.md](docs/MIGRATION.md) avant la mise en ligne.

## Points à valider avant production

- coûts internes et tarifs/minimums professionnels ;
- adresse expéditeur, emballages, services Shippo autorisés et données douanières ;
- mentions légales, régime de TVA, médiateur, codes tarifaires/origines ;
- contenus et traductions manuelles complètes ;
- licences Migra/Decalotype et médias définitifs ;
- matrice des anciennes URL issue du rapport d’import.

Le rapport de simulation courant est `migration-report-dry-run.json`. Il ne remplace pas la validation Staging avec accès WooCommerce authentifié, Stripe/Shippo de test et les contenus légaux définitifs.
