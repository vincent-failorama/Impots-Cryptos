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
    },
    // Bitget ne propose pas encore d'import API dans cette application.
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
        'Créez une clé API (Legacy API Key) avec la permission « brokerage:orders:read » ou « wallet:trades:read » uniquement.',
      keyCreationPath: "Paramètres → API → Nouvelle clé API (Legacy)",
      requiredPermission: 'uniquement la permission « brokerage:orders:read » (ou « wallet:trades:read »)',
    },
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
