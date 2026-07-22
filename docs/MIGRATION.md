# Migration WordPress/WooCommerce

L’import est volontairement en lecture seule côté WordPress et en simulation côté Supabase par défaut.

```bash
npm run import:wordpress -- --source=https://www.zencoffeelab.com
```

Le fichier `migration-report.json` liste les produits trouvés, traductions absentes, variantes non accessibles, médias, pages, FAQ Elementor, Conseils WordPress, produits d’archive et incohérences. Pour accéder aux variantes détaillées WooCommerce et aux produits non publics, fournir temporairement `WC_CONSUMER_KEY` et `WC_CONSUMER_SECRET` en lecture seule. Ne jamais les committer.

Après validation du rapport et avec les identifiants Supabase de Staging :

```bash
npm run import:wordpress -- --source=https://www.zencoffeelab.com --commit --report=migration-report-staging.json
```

Les produits courants sont importés en `draft` et les produits classés dans une catégorie Archive en `archived`. Les Conseils restent en brouillon et les FAQ importées restent masquées. La publication n’est possible qu’après contrôle manuel des deux traductions, des images, poids, stocks, coûts, prix public/pro, minimums, producteurs, régions, variétés, traitements, altitudes et données douanières. Les contenus Elementor sont nettoyés en blocs de paragraphes ; toute structure perdue est signalée dans le rapport.

Les comptes et commandes historiques ne sont pas importés. La sauvegarde WordPress reste disponible en lecture seule. Compléter `vercel.json` avec les redirections issues de l’inventaire final et vérifier chaque URL avec un crawler avant DNS.
