/**
 * Devises de cotation — source de vérité unique.
 *
 * Trois listes divergentes coexistaient (parsers, route Binance, route Gate.io),
 * d'où des comportements incohérents : une paire correctement découpée à
 * l'import CSV pouvait être ignorée par l'import API de la même plateforme.
 */

/** Toutes les devises pouvant apparaître en cotation dans une paire. */
export const QUOTE_CURRENCIES = [
  // Stablecoins USD
  "FDUSD", "BUSD", "TUSD", "USDT", "USDC", "USDE", "DAI",
  // Monnaies fiat
  "EUR", "USD", "GBP", "CHF", "TRY", "JPY", "AUD", "BRL",
  // Cryptos servant de cotation
  "BTC", "ETH", "BNB", "XBT",
] as const;

export type QuoteCurrency = (typeof QUOTE_CURRENCIES)[number];

/**
 * Même liste, triée par longueur décroissante.
 *
 * L'ordre est déterminant pour le découpage des paires collées : "USDT" doit
 * être testé avant "USD", sinon "BTCUSDT" donnerait la base "BTCT".
 */
export const QUOTE_CURRENCIES_BY_LENGTH: readonly string[] = [...QUOTE_CURRENCIES].sort(
  (a, b) => b.length - a.length
);

/**
 * Devises de cotation effectivement interrogées lors d'un import API.
 *
 * Volontairement plus restreint que `QUOTE_CURRENCIES` : chaque devise
 * supplémentaire multiplie le nombre de paires à balayer, donc la durée de
 * l'import. On couvre les marchés qui portent l'essentiel des volumes.
 *
 * Le type garantit que ces valeurs restent un sous-ensemble de la liste
 * canonique — une devise mal orthographiée ne compile pas.
 */
export const API_QUOTE_ASSETS: readonly QuoteCurrency[] = [
  "EUR",
  "USDT",
  "USDC",
  "BTC",
  "ETH",
  "BNB",
];
