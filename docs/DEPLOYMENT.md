# Déploiement, environnements et rollback

## Séparation des environnements

Créer deux projets Supabase : Preview/Staging et Production. Dans Cloudflare Workers, associer les variables de test au Worker de préproduction et les secrets réels uniquement au Worker de production. Ne placer sous `VITE_*` que l’URL du site, l’URL/clé anonyme Supabase, l’identifiant public Stripe et l’identifiant GA4. Les clés de service Supabase, Stripe, Shippo, Colissimo, Resend et `CRON_SECRET` restent exclusivement serveur.

Les flags `ALLOW_DEMO_DATA`, `PAYMENTS_MOCK`, `SHIPPING_MOCK` et `DEMO_ADMIN` doivent être `false` en Production ; le démarrage échoue volontairement sinon.

Renseigner `SHIPPO_API_TOKEN`, `SHIPPO_WEBHOOK_SECRET` et tous les champs `SHIP_FROM_*`, puis vérifier que le compte Colissimo intégré actif correspond à l’environnement test ou production. Pour proposer Colissimo Point Retrait, ajouter `COLISSIMO_PICKUP_API_KEY` comme secret serveur et, si fourni, `COLISSIMO_PICKUP_PARTNER_CLIENT_CODE`. Sans cette variable, le checkout conserve uniquement les livraisons à domicile.

## Promotion

1. Créer une branche et vérifier l’application avec `npm run preview:cloudflare`, reliée aux services de test.
2. Appliquer les migrations sur Staging, exécuter `npm run check` puis les E2E.
3. Importer le catalogue en simulation, corriger le rapport, puis relancer avec `--commit` sur Staging.
4. Tester France et au moins un autre pays UE, colis multiples, invitation pro, remboursement, PDF et suivi. Vérifier l’absence du Royaume-Uni dans tous les sélecteurs.
   Cette étape requiert les clés de test externes : les tests locaux n’utilisent ni débit Stripe ni achat réel d’étiquette.
5. Importer et geler le catalogue WordPress, appliquer la migration Production, puis exécuter l’import final.
6. Déployer sur Cloudflare Workers avec `npm run deploy` depuis le commit validé.
7. Vérifier sitemap, canonicals, hreflang, données structurées et matrice d’URL avant le basculement DNS.

## Activation progressive de Colissimo

1. Déployer d’abord Colissimo Domicile avec le compte intégré Shippo actif et l’adresse expéditeur complète. Vérifier les tarifs réels, un achat d’étiquette PDF, le suivi et le remboursement.
2. Retirer de Cloudflare les anciens secrets et webhook Sendcloud après validation. Les lignes historiques en base ne doivent pas être modifiées.
3. Ajouter ensuite `COLISSIMO_PICKUP_API_KEY`, puis valider Point Retrait en France et dans au moins un autre pays UE. Le checkout active automatiquement ce choix sans nouveau déploiement.

## Rollback

- Conserver l’identifiant de la dernière version Cloudflare Workers saine et la sauvegarde WordPress en lecture seule.
- En cas de défaut applicatif, restaurer la version Workers précédente depuis l’historique des déploiements Cloudflare.
- Ne jamais revenir en arrière sur une migration destructive. Ajouter une migration corrective compatible avec l’ancienne et la nouvelle version.
- Les événements Stripe/Shippo étant persistés et dédoublonnés, les rejouer après correction plutôt que modifier manuellement commandes ou stocks.
- Documenter le dernier numéro de commande/facture et contrôler les réservations actives après rollback.

## DNS

Réduire le TTL avant la fenêtre de migration. Geler les changements de produits WordPress, effectuer l’import final, vérifier toutes les anciennes URL, puis basculer `www.zencoffeelab.com`. Maintenir WordPress sans écriture le temps de la période de contrôle.
