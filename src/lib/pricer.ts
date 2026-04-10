const COINGECKO_API = "https://api.coingecko.com/api/v3";

export const CG_ASSET_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  BNB: "binancecoin",
  ADA: "cardano",
  SOL: "solana",
  XRP: "ripple",
  DOT: "polkadot",
  LINK: "chainlink",
  LTC: "litecoin",
  DOGE: "dogecoin",
  USDT: "tether",
  USDC: "usd-coin",
  MATIC: "matic-network",
  TRX: "tron",
  AVAX: "avalanche-2",
  ATOM: "cosmos",
  XLM: "stellar",
  ALGO: "algorand",
  BCH: "bitcoin-cash",
  XMR: "monero",
  EUR: "euro",
};

export function getCoinGeckoId(asset: string): string | null {
  return CG_ASSET_MAP[asset.toUpperCase()] ?? null;
}

// Cache module-level : survit aux re-renders, pas aux rechargements de page
const priceCache = new Map<string, number>(); // "cgId|dateStr" -> price

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Récupère le prix EUR historique d'un actif à une date donnée.
 *
 * @param asset    - Symbole (ex: "BTC")
 * @param dateStr  - Date au format "DD-MM-YYYY"
 * @param cgApiKey - Clé API CoinGecko Demo optionnelle (réduit le délai)
 * @param delayMs  - Délai de throttle avant la requête (ms). Si omis, 1500ms sans clé / 500ms avec clé.
 */
export async function fetchHistoricalPriceEur(
  asset: string,
  dateStr: string,
  cgApiKey?: string,
  delayMs?: number
): Promise<number | null> {
  const id = getCoinGeckoId(asset);
  if (!id) return null;

  const cacheKey = `${id}|${dateStr}`;
  if (priceCache.has(cacheKey)) return priceCache.get(cacheKey)!;

  // Throttle avant la requête pour respecter les limites de l'API
  const waitMs = delayMs ?? (cgApiKey ? 500 : 1500);
  await sleep(waitMs);

  const headers: Record<string, string> = {};
  if (cgApiKey) headers["x-cg-demo-api-key"] = cgApiKey;

  for (let attempt = 0; attempt < 3; attempt++) {
    // Exponential backoff sur les tentatives suivantes : 5s, 10s
    if (attempt > 0) await sleep(5000 * attempt);

    let res: Response;
    try {
      res = await fetch(
        `${COINGECKO_API}/coins/${id}/history?date=${dateStr}&localization=false`,
        { headers }
      );
    } catch {
      return null; // erreur réseau
    }

    if (res.status === 429) continue; // rate limited → retry avec backoff
    if (!res.ok) return null;

    const data = await res.json();
    const price: number | undefined = data?.market_data?.current_price?.eur;
    if (typeof price === "number") {
      priceCache.set(cacheKey, price);
      return price;
    }
    return null;
  }

  return null; // toutes les tentatives épuisées
}

export async function fetchCurrentPriceEur(asset: string): Promise<number | null> {
  const id = getCoinGeckoId(asset);
  if (!id) return null;

  const response = await fetch(
    `${COINGECKO_API}/simple/price?ids=${id}&vs_currencies=eur`,
    { next: { revalidate: 300 } }
  );

  if (!response.ok) return null;

  const data = await response.json();
  return data?.[id]?.eur ?? null;
}
