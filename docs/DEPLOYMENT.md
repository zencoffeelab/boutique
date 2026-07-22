# Déploiement, environnements et rollback

## Séparation des environnements

Créer deux projets Supabase : Preview/Staging et Production. Dans Vercel, limiter les secrets Preview au projet de test et les secrets Production au projet réel. Ne placer sous `VITE_*` que l’URL du site, l’URL/clé anonyme Supabase, l’identifiant public Stripe et l’identifiant GA4. Les clés de service Supabase, Stripe, Shippo, Resend et `CRON_SECRET` restent exclusivement serveur.

Les flags `ALLOW_DEMO_DATA`, `PAYMENTS_MOCK`, `SHIPPO_MOCK` et `DEMO_ADMIN` doivent être `false` en Production ; le démarrage échoue volontairement sinon.

Pour proposer Colissimo Point Retrait, ajouter `COLISSIMO_PICKUP_API_KEY` comme secret serveur. La clé se génère dans le profil Colissimo Box, section « Clés de connexion aux Web Services ». Sans cette variable, le checkout conserve uniquement les livraisons à domicile et ne propose jamais un tarif relais inutilisable.

## Promotion

1. Créer une branche et vérifier son Preview Vercel avec Supabase/Stripe/Shippo de test.
2. Appliquer les migrations sur Staging, exécuter `npm run check` puis les E2E.
3. Importer le catalogue en simulation, corriger le rapport, puis relancer avec `--commit` sur Staging.
4. Tester France, UE, Royaume-Uni, colis multiples, invitation pro, remboursement, PDF et suivi.
   Cette étape requiert les clés de test externes : les tests locaux n’utilisent ni débit Stripe ni achat réel d’étiquette.
5. Importer et geler le catalogue WordPress, appliquer la migration Production, puis exécuter l’import final.
6. Promouvoir exactement le déploiement Vercel validé ; ne pas reconstruire un nouvel artefact.
7. Vérifier sitemap, canonicals, hreflang, données structurées et matrice d’URL avant le basculement DNS.

## Rollback

- Conserver le dernier déploiement Vercel sain et la sauvegarde WordPress en lecture seule.
- En cas de défaut applicatif, réaffecter le domaine au déploiement précédent avec la promotion Vercel.
- Ne jamais revenir en arrière sur une migration destructive. Ajouter une migration corrective compatible avec l’ancienne et la nouvelle version.
- Les événements Stripe/Shippo étant persistés et dédoublonnés, les rejouer après correction plutôt que modifier manuellement commandes ou stocks.
- Documenter le dernier numéro de commande/facture et contrôler les réservations actives après rollback.

## DNS

Réduire le TTL avant la fenêtre de migration. Geler les changements de produits WordPress, effectuer l’import final, vérifier toutes les anciennes URL, puis basculer `www.zencoffeelab.com`. Maintenir WordPress sans écriture le temps de la période de contrôle.
