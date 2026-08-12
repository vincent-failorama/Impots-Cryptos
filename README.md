# crypto-tax-fr

Outil local de calcul d'impôt sur les crypto-actifs en France.

Calcule vos plus-values selon la méthode proportionnelle de l'**article 150 VH bis du CGI**,
estime l'impôt dû, identifie vos revenus BNC (staking, mining, airdrop) et prépare vos
déclarations Cerfa 2086 et 3916-bis.

---

## Fonctionnement

```
Plus-value = Prix de cession − (Prix de revient global × Prix de cession / Valeur globale du portefeuille)
```

- Le **prix de revient global** est cumulé depuis le premier achat et diminué proportionnellement à chaque cession
- La **valeur globale du portefeuille** est estimée via l'API CoinGecko à la date de chaque cession
- Les échanges **crypto→crypto** bénéficient du **sursis d'imposition** (art. 150 VH bis, II-A) : ils ne déclenchent pas d'imposition, mais le prix de revient global est reporté jusqu'à la sortie vers une monnaie fiat
- Le **staking, mining et airdrop** entrent dans le prix de revient global et génèrent un revenu BNC séparé
- Les **frais** augmentent le prix de revient à l'achat et diminuent le prix de cession à la vente
- Les plus-values sont **exonérées** si le total annuel des prix de cession n'excède pas **305 €**
- L'**impôt** est estimé au prélèvement forfaitaire unique de 30 % (12,8 % IR + 17,2 % prélèvements sociaux)

---

## Ce que fait l'application

| | |
|---|---|
| **Importer** | CSV de 12 plateformes, ou connexion API en lecture seule (5 d'entre elles). Si les colonnes ne sont pas reconnues, vous les désignez vous-même et la correspondance est mémorisée. |
| **Mes données** | Transactions brutes : ajout manuel, correction d'une ligne mal lue, suppression, sauvegarde et restauration au format JSON. |
| **Cessions** | Détail des cessions imposables par année fiscale, avec filtres et export CSV. |
| **Cerfa** | Cases 3AN / 3BN / 3VH, revenus BNC (case 5HQ), comptes 3916-bis, estimation de l'impôt, et export PDF incluant le détail ligne à ligne du formulaire 2086. |

---

## Plateformes supportées

| Plateforme   | Import CSV | Import API | Format CSV vérifié |
|--------------|:----------:|:----------:|:------------------:|
| Binance      | ✓          | ✓          | ✓                  |
| Kraken       | ✓          | ✓          | ✓                  |
| Coinbase     | ✓          | ✓ ¹        | ✓                  |
| KuCoin       | ✓          | ✓          | ✓                  |
| Gate.io      | ✓          | ✓          | ✓                  |
| Bitget       | ✓          |            | ✓                  |
| Bitpanda     | ✓          |            |                    |
| Coinhouse    | ✓          |            |                    |
| Crypto.com   | ✓          |            |                    |
| Ledger Live  | ✓          |            |                    |
| Revolut      | ✓          |            |                    |
| Swissborg    | ✓          |            |                    |

> **Colonne « Format CSV vérifié »** : les libellés de colonnes attendus proviennent
> de la documentation publique de chaque plateforme, mais n'ont pas tous été
> confrontés à un export réel. Si un import ne remonte aucune transaction,
> l'application affiche les colonnes trouvées dans votre fichier et vous propose
> de désigner vous-même à quoi chacune correspond. La correspondance est
> mémorisée : les imports suivants fonctionnent sans rien redéfinir.
>
> Ce mécanisme rend l'import possible **pour n'importe quel export CSV**, y
> compris d'une plateforme absente de la liste — choisissez alors celle dont le
> format se rapproche le plus et définissez la correspondance.

> **Ledger Live** exporte des mouvements de portefeuille, pas des ordres : ces
> lignes sont importées comme non imposables. Complétez-les avec l'export de la
> plateforme sur laquelle l'achat a réellement eu lieu.
>
> ¹ **Coinbase** : les clés API « legacy » ont expiré le 5 février 2025. L'import
> API utilise l'authentification JWT de Coinbase Developer Platform — créez une
> clé sur [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com) et
> renseignez son nom complet (`organizations/…/apiKeys/…`) ainsi que son secret.
> Les signatures Ed25519 et ECDSA sont gérées.

---

## Installation et Démarrage

L'application peut être lancée de deux manières : via Docker (recommandé) ou via Node.js en local.

### Option 1 : Via Docker (Recommandé)

C'est la méthode la plus simple. Elle garantit un environnement propre et la persistance de vos données.

1. Assurez-vous d'avoir [Docker](https://docs.docker.com/get-docker/) installé sur votre machine.
2. Clonez le dépôt et lancez le conteneur :

```bash
git clone git@github.com:vincent-failorama/Impots-Cryptos.git
cd Impots-Cryptos
docker compose up -d --build
```
3. Ouvrez [http://localhost:3000](http://localhost:3000).

*Vos transactions sont sauvegardées en toute sécurité dans le dossier local `./data/` monté en volume.*

### Option 2 : Via Node.js en local (Pour les développeurs)

```bash
git clone git@github.com:vincent-failorama/Impots-Cryptos.git
cd Impots-Cryptos
npm install
git update-index --skip-worktree data/transactions.json
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

> `git update-index --skip-worktree data/transactions.json` empêche Git de tracker vos transactions personnelles. À exécuter une seule fois après le clone.

---

## Structure

```
src/
  app/
    page.tsx              # Accueil — graphique des plus-values par année
    import/               # Import CSV et connexion API brokers
    donnees/              # Transactions brutes — ajout, correction, sauvegarde
    transactions/         # Tableau des cessions imposables
    cerfa/                # Cerfa 2086 (plus-values) + 3916-bis (comptes étrangers) + BNC
    aide/                 # Guide d'utilisation
    api/
      transactions/       # API REST — lecture/écriture de transactions.json
      fetch/              # Proxies API brokers (Binance, Kraken, Coinbase, KuCoin, Gate.io)
  lib/
    types.ts              # Types partagés (Transaction, TransactionType…)
    calculator.ts         # Moteur de calcul 150 VH bis + BNC
    cerfa.ts              # Génération PDF du récapitulatif 2086 / BNC / 3916-bis
    pricer.ts             # Prix historiques CoinGecko (throttle, retry, cache persistant)
    parsers/              # Parsers CSV par plateforme
```

## Ajouter une plateforme

Toutes les plateformes sont décrites dans `src/lib/platforms.ts` — libellé, guide
d'export, colonnes CSV, configuration API. Le type `TransactionPlatform`, la
validation serveur, les menus de la page Importer et les guides de la page Aide
en dérivent automatiquement.

**Format CSV « une ligne = un ordre »** (le cas courant) :

1. Ajouter une entrée dans `PLATFORMS`, avec `csvColumns` décrivant les libellés
   de colonnes de l'export (plusieurs alias possibles par champ).
2. Ajouter `monid: fromRegistry("monid")` dans `CSV_PARSERS`
   (`src/lib/parsers/index.ts`).

Aucun code d'analyse à écrire : le parser générique est piloté par `csvColumns`.
Si l'étape 2 est oubliée, la compilation échoue.

**Format atypique** — écrire un parser dédié (voir `coinbase.ts`, `kucoin.ts`) et
le référencer dans `CSV_PARSERS` à la place de `fromRegistry`.

**Import par API** — renseigner le bloc `api` du registre et créer la route
`src/app/api/fetch/<id>/route.ts`. Chaque plateforme ayant son propre schéma de
signature, cette partie reste spécifique.

## Scripts

```bash
npm run dev             # serveur de développement
npm run build           # build de production
npm run lint            # ESLint (next lint)
npm run typecheck       # tsc --noEmit
npm test                # tests unitaires (node:test)
npm run verify          # typecheck + lint + tests
npm run electron:build  # application Windows (installateur NSIS dans dist/)
```

### Application de bureau

`npm run electron:build` produit un installateur Windows dans `dist/`. L'application
embarque le serveur Next.js et écrit vos transactions dans le dossier utilisateur
(`%APPDATA%/crypto-tax-fr/data/`), jamais dans le dossier du projet. Le port 3000 est
utilisé s'il est libre, sinon un port disponible est choisi automatiquement.

---

## Confidentialité

Tout tourne localement. Aucune donnée n'est envoyée à un service tiers, à l'exception des appels à l'API publique **CoinGecko** pour récupérer les prix historiques.

- Transactions stockées dans `data/transactions.json` sur votre machine
- Prix historiques CoinGecko mis en cache dans le localStorage du navigateur (un cours passé étant immuable, il n'est récupéré qu'une seule fois)
- Clés API brokers : utilisées le temps d'une requête, jamais persistées sur disque (option localStorage disponible)
- Comptes 3916-bis : stockés dans le localStorage du navigateur uniquement
- Clé API CoinGecko (optionnelle) : stockée dans le localStorage du navigateur

---

## Limites

- **Staking/mining/airdrop** : détectés automatiquement lorsque l'export mentionne le type d'opération (« Staking Reward », « Earn », « Récompense »…). Certaines plateformes ne les incluent pas dans l'export des ordres : il faut alors importer le fichier « Ledgers » / « Earn History » séparément, ou saisir la ligne depuis la page **Mes données**.
- **Frais** : lus depuis les CSV lorsqu'ils sont libellés en euros. Des frais payés en crypto (BNB, KCS…) sont ignorés plutôt qu'approximés — leur conversion exigerait le cours à la date exacte.
- **Prix historiques** : l'API CoinGecko publique est limitée (~30 req/min). Un historique volumineux peut prendre plusieurs minutes. Une [clé Demo gratuite](https://www.coingecko.com/en/api) réduit ce délai de moitié.
- **Valeur du portefeuille incertaine** : si CoinGecko ne retourne pas de prix pour un actif, la valeur globale du portefeuille est estimée par fallback. Les lignes concernées sont signalées par un ⚠️ dans le tableau des cessions.
- **Import par API** : exercé jusqu'à l'authentification pour Gate.io et Coinbase uniquement. Les routes Binance, Kraken et KuCoin n'ont pas été testées avec de vraies clés. L'import CSV reste la voie garantie.
- **Barème progressif** : l'impôt est estimé au prélèvement forfaitaire unique. L'option pour le barème progressif dépend de votre tranche marginale et n'est pas calculée.
- **Report des moins-values** : une moins-value s'impute sur les plus-values de la même année et n'est pas reportable sur les suivantes — l'application applique cette règle.
- Cet outil est une aide à la déclaration. Il ne constitue pas un conseil fiscal. En cas de doute, consultez un expert-comptable ou [impots.gouv.fr](https://www.impots.gouv.fr).

---

## Stack

- [Next.js 14](https://nextjs.org/) (App Router)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [pdf-lib](https://pdf-lib.js.org/) — génération PDF côté client
- [CoinGecko API v3](https://www.coingecko.com/api/documentation) — prix historiques
