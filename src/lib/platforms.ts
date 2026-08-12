/**
 * Registre des plateformes — source de vérité unique.
 *
 * Tout ce qui dépend de la liste des plateformes en dérive : le type
 * `TransactionPlatform`, la validation côté serveur, les deux menus de la page
 * Importer, le dispatch des parsers CSV et les guides de la page Aide.
 *
 * Ajouter une plateforme = ajouter une entrée ici, puis brancher son parser
 * dans `parsers/index.ts` (le compilateur exige les deux).
 *
 * Ce module ne contient que des données : aucune dépendance à React ni aux
 * parsers, pour rester importable aussi bien côté serveur que client.
 */

/**
 * Libellés de colonnes acceptés pour chaque champ d'un export CSV.
 *
 * Les alias sont essayés dans l'ordre ; la comparaison ignore la casse et la
 * ponctuation (« Date(UTC) », « Date UTC » et « date_utc » sont équivalents).
 * Décrire les colonnes en données plutôt qu'en code permet de partager un seul
 * parser entre toutes les plateformes au format « une ligne = un ordre ».
 */
export type CsvColumnMap = {
  readonly date: readonly string[];
  /** Paire de trading, dont l'actif de base est extrait (ex. « BTCEUR »). */
  readonly pair: readonly string[];
  /** Sens de l'ordre : achat ou vente. */
  readonly side: readonly string[];
  /** Quantité d'actif échangée. */
  readonly qty: readonly string[];
  /** Contrepartie totale dans la devise de cotation. */
  readonly total: readonly string[];
  /** Prix unitaire ; recalculé depuis total / qty s'il est absent. */
  readonly price: readonly string[];
  /** Identifiant d'ordre, utilisé pour le dédoublonnage. */
  readonly id: readonly string[];
  /** Montant des frais. Facultatif : tous les exports n'en fournissent pas. */
  readonly fee?: readonly string[];
  /** Devise des frais — ils ne sont retenus que s'ils sont en euros. */
  readonly feeCurrency?: readonly string[];
};

export type PlatformApiConfig = {
  /** Consigne de sécurité affichée dans la page Importer, onglet API. */
  readonly securityNote: string;
  /** Chemin de création de la clé sur le site de la plateforme (page Aide). */
  readonly keyCreationPath: string;
  /** Permission strictement nécessaire — mise en évidence dans l'interface. */
  readonly requiredPermission: string;
  /** La plateforme exige une phrase secrète en plus de la clé et du secret. */
  readonly requiresPassphrase?: boolean;
  /**
   * L'import balaie de nombreuses paires de marché : l'interface prévient
   * alors l'utilisateur du temps d'attente.
   */
  readonly queriesManyPairs?: boolean;
};

/**
 * Forme d'une entrée du registre, avant dérivation de `PlatformId`.
 * `id` y est un `string` afin d'éviter une définition circulaire — le type
 * exporté `PlatformDefinition` le restreint ensuite à `PlatformId`.
 */
type PlatformDefinitionBase = {
  readonly id: string;
  /** Nom affiché à l'utilisateur. */
  readonly label: string;
  /** Marche à suivre pour obtenir l'export CSV. */
  readonly csvExportSteps: readonly string[];
  /** Avertissement propre à l'export CSV de cette plateforme. */
  readonly csvNote?: string;
  /**
   * Colonnes de l'export CSV, pour les plateformes exploitables par le parser
   * générique. Absent lorsque le format impose un parser dédié (Coinbase et
   * KuCoin, dont les exports portent une logique propre).
   */
  readonly csvColumns?: CsvColumnMap;
  /** `null` lorsque l'import par API n'est pas supporté. */
  readonly api: PlatformApiConfig | null;
};

const PLATFORMS_RAW = [
  {
    id: "binance",
    label: "Binance",
    csvExportSteps: [
      "Méthode recommandée : utilisez l'onglet « Via API » dans la page Importer pour récupérer tout l'historique en une seule opération (sans limite de 6 mois).",
      'Méthode CSV (limitée à 6 mois) : connectez-vous sur binance.com → Portefeuille → Historique des transactions → Exporter → Type « Transactions spot » → Générer.',
      "Pour un historique complet via CSV : exportez période par période (6 mois à la fois) et importez chaque fichier séparément.",
    ],
    csvNote:
      "L'export CSV Binance est limité à 6 mois par fichier. Préférez la connexion API (lecture seule) pour obtenir l'historique complet en une fois.",
    csvColumns: {
      date: ["date(utc)", "utc_time", "date", "time", "created time"],
      pair: ["market", "symbol", "pair", "currency pair"],
      side: ["type", "side", "operation", "direction"],
      qty: ["amount", "executed", "quantity", "vol", "filled"],
      total: ["total", "amount_total", "cost", "quote amount"],
      price: ["price", "avg price", "average price"],
      id: ["order id", "trade id", "orderno", "id"],
      fee: ["fee", "commission", "trading fee"],
      feeCurrency: ["fee coin", "commission asset", "fee currency"],
    },
    api: {
      securityNote:
        'Créez une clé API en lecture seule (permission « Enable Reading » uniquement — n\'activez pas le trading ni les retraits).',
      keyCreationPath: "Profil → Gestion des clés API → Créer une clé API (Système généré)",
      requiredPermission: 'uniquement « Enable Reading »',
      queriesManyPairs: true,
    },
  },
  {
    id: "bitget",
    label: "Bitget",
    csvExportSteps: [
      "Connectez-vous sur bitget.com",
      "Actifs → Historique des ordres → Spot",
      "Filtrez par date → Exporter",
      "Téléchargez le fichier CSV reçu par e-mail ou disponible directement",
    ],
    csvColumns: {
      date: ["date", "time", "order time", "filled time", "ctime"],
      pair: ["symbol", "pair", "trading pair", "market"],
      side: ["side", "type", "direction", "order type"],
      qty: ["amount", "filled amount", "quantity", "size", "vol"],
      total: ["total", "filled value", "cost", "turnover"],
      price: ["price", "avg price", "filled price"],
      id: ["order id", "orderid", "id"],
      fee: ["fee", "fees", "trading fee"],
      feeCurrency: ["fee coin", "fee currency"],
    },
    // Bitget ne propose pas encore d'import API dans cette application.
    api: null,
  },
  {
    id: "bitpanda",
    label: "Bitpanda",
    csvExportSteps: [
      "Connectez-vous sur bitpanda.com",
      "Profil → Historique des transactions",
      "Cliquez sur « Exporter » → format CSV",
      "Choisissez « Toutes les transactions » et la période souhaitée",
    ],
    csvNote:
      "L'export Bitpanda comporte une colonne « Asset » plutôt qu'une paire : le montant en euros est lu depuis « Amount Fiat ».",
    csvColumns: {
      date: ["timestamp", "date", "datum", "created at", "time"],
      pair: ["asset", "cryptocoin", "symbol", "pair", "actif"],
      side: ["transaction type", "type", "in/out", "direction"],
      qty: ["amount asset", "amount cryptocoin", "quantity", "amount", "quantité"],
      total: ["amount fiat", "fiat amount", "value", "total", "montant"],
      price: ["asset market price", "price", "prix", "cours"],
      id: ["transaction id", "id", "order id"],
      fee: ["fee", "frais"],
      feeCurrency: ["fee asset", "fee currency"],
    },
    api: null,
  },
  {
    id: "coinbase",
    label: "Coinbase",
    csvExportSteps: [
      "Connectez-vous sur coinbase.com",
      "Profil → Relevés (Statements)",
      "Choisissez « Transaction history » puis le format CSV",
      "Sélectionnez l'année souhaitée → Générer → Télécharger",
    ],
    csvNote:
      "L'export Coinbase inclut les revenus de staking et les récompenses : ils sont détectés automatiquement et déclarés en BNC.",
    api: {
      securityNote:
        'Créez une clé sur Coinbase Developer Platform (portal.cdp.coinbase.com) avec la permission « View » uniquement. Renseignez le nom complet de la clé (organizations/…/apiKeys/…) et son secret. Les anciennes clés API ont expiré le 5 février 2025 et ne fonctionnent plus.',
      keyCreationPath: "portal.cdp.coinbase.com → API Keys → Create API key",
      requiredPermission: 'uniquement la permission « View » (lecture seule)',
    },
  },
  {
    id: "coinhouse",
    label: "Coinhouse",
    csvExportSteps: [
      "Connectez-vous sur coinhouse.com",
      "Mon compte → Historique / Mes transactions",
      "Cliquez sur « Exporter » ou « Télécharger l'historique »",
      "Choisissez le format CSV et la période souhaitée",
    ],
    csvNote:
      "Coinhouse est un PSAN enregistré en France : ses exports utilisent des libellés de colonnes français.",
    csvColumns: {
      date: ["date", "date de transaction", "date d'opération", "timestamp", "horodatage"],
      pair: ["devise", "actif", "crypto", "currency", "asset", "paire", "pair", "symbole"],
      side: ["type", "type d'opération", "opération", "sens", "operation", "side"],
      qty: ["quantité", "quantite", "montant crypto", "nombre", "quantity", "amount"],
      total: ["montant", "montant eur", "montant total", "total", "contrepartie", "value"],
      price: ["prix", "prix unitaire", "cours", "price"],
      id: ["référence", "reference", "id", "identifiant", "numéro de transaction"],
      fee: ["frais", "fee", "commission"],
      feeCurrency: ["devise des frais", "fee currency"],
    },
    api: null,
  },
  {
    id: "cryptocom",
    label: "Crypto.com",
    csvExportSteps: [
      "Application Crypto.com : Comptes → Historique des transactions → icône d'export",
      "Crypto.com Exchange : Wallet → Transaction History → Export",
      "Sélectionnez la période puis téléchargez le CSV",
      "Importez ici l'export « Trade History » (ordres d'achat et de vente)",
    ],
    csvNote:
      "Deux exports coexistent. Celui de l'Exchange (une ligne par ordre) est le mieux exploité ; celui de l'application mélange de nombreux types d'opérations.",
    csvColumns: {
      date: ["timestamp (utc)", "trade time", "create time", "date", "time", "timestamp"],
      pair: ["pair", "instrument", "instrument_name", "market", "currency", "symbol"],
      side: ["side", "trade side", "type", "transaction kind", "transaction description"],
      qty: ["quantity", "traded quantity", "size", "amount", "volume"],
      total: ["total", "traded value", "value", "native amount", "cost", "fees value"],
      price: ["price", "trade price", "avg price", "native amount per unit"],
      id: ["trade id", "order id", "transaction hash", "id"],
      fee: ["fee", "fees", "trading fee"],
      feeCurrency: ["fee currency", "fee instrument"],
    },
    api: null,
  },
  {
    id: "gate",
    label: "Gate.io",
    csvExportSteps: [
      "Connectez-vous sur gate.io",
      "Ordres → Historique des ordres au comptant",
      'Cliquez sur « Exporter » en haut à droite',
      "Choisissez la plage de dates → Télécharger CSV",
    ],
    csvColumns: {
      date: ["createtime", "create time", "date", "time", "fill time"],
      pair: ["pair", "symbol", "currency pair", "market"],
      side: ["type", "side", "direction"],
      qty: ["amount", "quantity", "size", "vol"],
      total: ["total", "cost", "turnover", "value"],
      price: ["price", "avg price"],
      id: ["ordernumber", "order number", "order id", "id"],
      fee: ["fee", "frais"],
      feeCurrency: ["fee currency", "fee coin"],
    },
    api: {
      securityNote:
        'Créez une clé API v4 en lecture seule (permission « Spot Trade » configurée sur « Read Only »).',
      keyCreationPath: "Gestion des API → Créer une clé APIv4",
      requiredPermission: 'uniquement « Spot Trade » en « Read Only »',
      queriesManyPairs: true,
    },
  },
  {
    id: "kraken",
    label: "Kraken",
    csvExportSteps: [
      "Connectez-vous sur kraken.com",
      "Historique → Exporter",
      'Type d\'export : « Trades »',
      "Sélectionnez la période → Soumettre → Télécharger",
    ],
    csvNote: 'Choisissez « Trades » et non « Ledgers » pour obtenir les bonnes données.',
    csvColumns: {
      date: ["time", "date", "created"],
      pair: ["pair", "market", "symbol"],
      side: ["type", "side", "direction"],
      qty: ["vol", "volume", "amount", "quantity"],
      total: ["cost", "total", "value"],
      price: ["price", "avg price"],
      id: ["txid", "trade id", "ordertxid", "id"],
      fee: ["fee", "fees"],
      feeCurrency: ["fee currency"],
    },
    api: {
      securityNote:
        'Créez une clé API avec les permissions « Query Funds » et « Query Closed Orders & Trades » uniquement.',
      keyCreationPath: "Sécurité → API → Créer une clé API",
      requiredPermission: 'uniquement « Query Funds » et « Query Closed Orders & Trades »',
    },
  },
  {
    id: "kucoin",
    label: "KuCoin",
    csvExportSteps: [
      "Connectez-vous sur kucoin.com",
      "Actifs → Historique des ordres → Ordres réalisés",
      'Cliquez sur « Exporter les données »',
      'Sélectionnez « Spot » et la plage de dates → Exporter',
      "Téléchargez le CSV (envoyé par e-mail ou disponible dans les exports)",
    ],
    api: {
      securityNote:
        'Créez une clé API Trading avec la permission « General » uniquement. Renseignez également la phrase secrète (Passphrase) créée avec la clé.',
      keyCreationPath: "Gestion des API → Créer une API (Type : API Trading)",
      requiredPermission: 'uniquement « General »',
      requiresPassphrase: true,
    },
  },
  {
    id: "ledgerlive",
    label: "Ledger Live",
    csvExportSteps: [
      "Ouvrez Ledger Live sur votre ordinateur",
      "Comptes → menu ⋯ en haut à droite → « Exporter les opérations »",
      "Sélectionnez les comptes à inclure puis enregistrez le fichier CSV",
    ],
    csvNote:
      "Ledger Live exporte des mouvements de portefeuille (entrées et sorties), pas des ordres d'achat ou de vente. Ces lignes sont importées comme non imposables : complétez-les avec l'export de la plateforme où l'achat a eu lieu.",
    csvColumns: {
      date: ["operation date", "date", "date de l'opération"],
      pair: ["currency ticker", "currency", "ticker", "asset"],
      side: ["operation type", "type", "type d'opération"],
      qty: ["operation amount", "amount", "montant"],
      total: ["countervalue at operation date", "countervalue", "contre-valeur", "value"],
      price: ["price", "prix", "cours"],
      id: ["operation hash", "hash", "id"],
      fee: ["operation fees", "fees"],
      feeCurrency: ["currency ticker"],
    },
    api: null,
  },
  {
    id: "revolut",
    label: "Revolut",
    csvExportSteps: [
      "Application Revolut : onglet Crypto → sélectionnez un actif",
      "Menu ⋯ → « Relevé » (Statement)",
      "Choisissez le format Excel/CSV et la période",
      "Répétez l'opération pour chaque crypto détenue",
    ],
    csvNote:
      "Revolut génère un relevé par crypto-actif : importez chaque fichier séparément.",
    csvColumns: {
      date: ["date", "completed date", "started date", "date completed", "time"],
      pair: ["symbol", "product", "currency", "ticker", "description"],
      side: ["type", "transaction type", "side", "direction"],
      qty: ["quantity", "amount", "units", "quantité"],
      total: ["value", "fiat amount", "total amount", "amount (eur)", "total"],
      price: ["price", "price per unit", "prix"],
      id: ["id", "reference", "transaction id"],
      fee: ["fees", "fee"],
      feeCurrency: ["fee currency", "currency"],
    },
    api: null,
  },
  {
    id: "swissborg",
    label: "Swissborg",
    csvExportSteps: [
      "Application Swissborg : Profil → Historique / Relevés",
      "Sélectionnez « Exporter mes transactions »",
      "Choisissez la période et le format CSV",
      "Le fichier est envoyé par e-mail ou téléchargeable directement",
    ],
    csvNote:
      "L'export Swissborg mêle achats, ventes et récompenses Earn : seuls les achats et ventes sont interprétés comme des cessions.",
    csvColumns: {
      date: ["local time", "time (utc)", "timestamp", "date", "time"],
      pair: ["currency", "asset", "ticker", "symbol", "pair"],
      side: ["type", "transaction type", "operation", "side"],
      qty: ["net amount", "gross amount", "amount", "quantity", "quantité"],
      total: ["value (eur)", "fiat value", "eur value", "value", "total", "montant"],
      price: ["price", "unit price", "rate", "prix"],
      id: ["id", "transaction id", "reference"],
      fee: ["fee", "fees"],
      feeCurrency: ["fee currency"],
    },
    api: null,
  },
] as const satisfies readonly PlatformDefinitionBase[];

/** Identifiant de plateforme, dérivé du registre : impossible de désynchroniser. */
export type PlatformId = (typeof PLATFORMS_RAW)[number]["id"];

export type PlatformDefinition = Omit<PlatformDefinitionBase, "id"> & {
  readonly id: PlatformId;
};

/**
 * Vue élargie du registre : les littéraux sont ramenés à `PlatformDefinition`,
 * afin que les champs optionnels (`csvNote`, `requiresPassphrase`…) restent
 * accessibles quelle que soit l'entrée manipulée.
 */
export const PLATFORMS: readonly PlatformDefinition[] = PLATFORMS_RAW;

export const PLATFORM_IDS: readonly PlatformId[] = PLATFORMS_RAW.map((p) => p.id);

/** Plateformes proposant un import par API. */
export const API_PLATFORMS: readonly (PlatformDefinition & { api: PlatformApiConfig })[] =
  PLATFORMS.filter(
    (p): p is PlatformDefinition & { api: PlatformApiConfig } => p.api !== null
  );

export function getPlatform(id: PlatformId): PlatformDefinition {
  // L'appelant fournit un PlatformId : l'entrée existe forcément.
  return PLATFORMS.find((p) => p.id === id)!;
}

/** Garde de type — utilisée pour valider les entrées non fiables (API HTTP). */
export function isPlatformId(value: unknown): value is PlatformId {
  return typeof value === "string" && PLATFORM_IDS.includes(value as PlatformId);
}
