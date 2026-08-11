# Zen Coffee Lab — e-commerce React/Vite

Refonte SSR bilingue du site Zen Coffee Lab, sans dépendance à WordPress au runtime. Le projet utilise React Router en Framework Mode avec Vite, Cloudflare Workers, Supabase (PostgreSQL/Auth/Storage), Stripe Checkout, Shippo/Colissimo et Resend.

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
- `app/services` : checkout Stripe, Shippo/Colissimo, factures PDF privées et file Resend.
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

- Stripe : le checkout réserve la commande avant la redirection vers Stripe. Le webhook signé `/api/webhooks/stripe` traite `checkout.session.completed`, `checkout.session.expired` et `charge.refunded` ; après confirmation, la commande reçoit son numéro définitif et apparaît dans le back-office, où les étiquettes Colissimo peuvent être générées explicitement.
- Shippo : prestataire exclusif des nouveaux devis, étiquettes, suivis et remboursements. Renseigner `SHIPPO_API_TOKEN`, activer le compte Colissimo intégré et configurer le webhook signé sur `/api/webhooks/shippo`. Le site découvre puis met en cache ce compte et ne retient que `colissimo_home`, `colissimo_international_expert` et `colissimo_pick_up_point`.
- Point Retrait : `COLISSIMO_PICKUP_API_KEY` active automatiquement la recherche officielle Colissimo dans les pays UE compatibles ; `COLISSIMO_PICKUP_PARTNER_CLIENT_CODE` est optionnel. Sans clé, le checkout reste disponible en Colissimo à domicile.
- Franco : `FREE_SHIPPING_FR_CENTS=7500` et `FREE_SHIPPING_EU_UK_CENTS=15000` (nom conservé pour compatibilité) règlent les seuils France et reste de l’Union européenne.
- Historique : les colonnes et anciennes expéditions Sendcloud restent en base et sont affichées en lecture seule. Aucun secret, webhook, téléchargement ou appel Sendcloud n’est utilisé par l’application active.
- Resend : domaine d’envoi validé et `RESEND_FROM_EMAIL` ; toute communication passe par l’outbox.
- GA4 : uniquement `VITE_GA_MEASUREMENT_ID`, chargé après consentement. Aucun événement ne doit contenir d’e-mail, téléphone, adresse ou nom.

Voir [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) et [docs/MIGRATION.md](docs/MIGRATION.md) avant la mise en ligne.

## Points à valider avant production

- coûts internes et tarifs/minimums professionnels ;
- compte Colissimo intégré actif dans Shippo, adresse expéditeur complète et emballages ;
- mentions légales, régime de TVA, médiateur, codes tarifaires/origines ;
- contenus et traductions manuelles complètes ;
- licences Migra/Decalotype et médias définitifs ;
- matrice des anciennes URL issue du rapport d’import.

Le rapport de simulation courant est `migration-report-dry-run.json`. Il ne remplace pas la validation Staging avec accès WooCommerce authentifié, Stripe/Shippo de test et les contenus légaux définitifs.
