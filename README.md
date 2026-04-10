# crypto-tax-fr

Outil local de calcul d'impôt sur les crypto-actifs en France.

Calcule vos plus-values selon la méthode proportionnelle de l'**article 150 VH bis du CGI**, identifie vos revenus BNC (staking, mining, airdrop) et prépare vos déclarations Cerfa 2086 et 3916-bis.

---

## Fonctionnement

```
Plus-value = Prix de cession − (Prix de revient global × Prix de cession / Valeur globale du portefeuille)
```

- Le **prix de revient global** est cumulé depuis le premier achat et diminué proportionnellement à chaque cession
- La **valeur globale du portefeuille** est estimée via l'API CoinGecko à la date de chaque cession
- Les échanges **crypto→crypto** sont des événements taxables au même titre que les ventes en euros
- Le **staking, mining et airdrop** entrent dans le prix de revient global et génèrent un revenu BNC séparé

---

## Plateformes supportées

| Plateforme | Import CSV | Import API |
|------------|:----------:|:----------:|
| Binance    | ✓          | ✓          |
| Kraken     | ✓          | ✓          |
| Coinbase   | ✓          | ✓          |
| KuCoin     | ✓          | ✓          |
| Bitget     | ✓          |            |
| Gate.io    | ✓          | ✓          |

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
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

Les transactions sont stockées dans `data/transactions.json` (créé automatiquement).

---

## Structure

```
src/
  app/
    page.tsx              # Accueil — graphique des plus-values par année
    import/               # Import CSV et connexion API brokers
    transactions/         # Tableau des cessions imposables
    cerfa/                # Cerfa 2086 (plus-values) + 3916-bis (comptes étrangers) + BNC
    aide/                 # Guide d'utilisation
    api/
      transactions/       # API REST — lecture/écriture de transactions.json
      fetch/              # Proxies API brokers (Binance, Kraken, Coinbase, KuCoin, Gate.io)
  lib/
    types.ts              # Types partagés (Transaction, TransactionType…)
    calculator.ts         # Moteur de calcul 150 VH bis + BNC
    pricer.ts             # Récupération des prix historiques CoinGecko (throttle + retry)
    parsers/              # Parsers CSV par plateforme
```

---

## Confidentialité

Tout tourne localement. Aucune donnée n'est envoyée à un service tiers, à l'exception des appels à l'API publique **CoinGecko** pour récupérer les prix historiques.

- Transactions stockées dans `data/transactions.json` sur votre machine
- Clés API brokers : utilisées le temps d'une requête, jamais persistées sur disque (option localStorage disponible)
- Comptes 3916-bis : stockés dans le localStorage du navigateur uniquement
- Clé API CoinGecko (optionnelle) : stockée dans le localStorage du navigateur

---

## Limites

- **Staking/mining/airdrop** : seul l'export Coinbase inclut ces événements. Pour Binance, Kraken et KuCoin il faut importer le fichier "Ledgers" / "Earn History" manuellement (pas encore supporté).
- **Prix historiques** : l'API CoinGecko publique est limitée (~30 req/min). Un historique volumineux peut prendre plusieurs minutes. Une [clé Demo gratuite](https://www.coingecko.com/en/api) réduit ce délai de moitié.
- **Valeur du portefeuille incertaine** : si CoinGecko ne retourne pas de prix pour un actif, la valeur globale du portefeuille est estimée par fallback. Les lignes concernées sont signalées par un ⚠️ dans le tableau des cessions.
- Cet outil est une aide à la déclaration. Il ne constitue pas un conseil fiscal. En cas de doute, consultez un expert-comptable ou [impots.gouv.fr](https://www.impots.gouv.fr).

---

## Stack

- [Next.js 14](https://nextjs.org/) (App Router)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [pdf-lib](https://pdf-lib.js.org/) — génération PDF côté client
- [CoinGecko API v3](https://www.coingecko.com/api/documentation) — prix historiques
