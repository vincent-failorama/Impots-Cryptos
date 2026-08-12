/**
 * Politique de temporisation des appels externes.
 *
 * La règle « 500 ms avec clé, 1500 ms sans » était écrite en double, dans le
 * pricer et dans le calculateur. Rien ne les liait : modifier l'une laissait
 * l'autre en désaccord silencieux. Elle est désormais dérivée d'une fonction.
 */

/** Limites de l'API CoinGecko. */
export const COINGECKO = {
  /** Sans clé, l'API publique tolère ~10–30 requêtes/minute. */
  throttleMsAnonymous: 1500,
  /** Une clé Demo gratuite relève la limite à ~30 req/min. */
  throttleMsWithKey: 500,
  /** Nombre de tentatives sur réponse 429. */
  maxRetries: 3,
  /** Palier de backoff : 5 s puis 10 s. */
  retryBackoffMs: 5000,
} as const;

/** Délai à respecter avant un appel CoinGecko, selon la présence d'une clé. */
export function coinGeckoThrottleMs(apiKey?: string): number {
  return apiKey ? COINGECKO.throttleMsWithKey : COINGECKO.throttleMsAnonymous;
}

/**
 * Pause entre deux requêtes lors du balayage des paires de marché, par
 * plateforme. Ces valeurs découlent des quotas publiés par chaque exchange.
 */
export const BROKER_PAUSE_MS = {
  /** 1200 req/min sur l'IP, 10 points/s sur la clé. */
  binance: 100,
  /** ~200 req/10 s sur les endpoints privés. */
  gate: 60,
} as const;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
