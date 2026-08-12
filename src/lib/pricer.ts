import { STORAGE_KEYS, readJson, remove, writeJson } from "./storage";
import { COINGECKO, coinGeckoThrottleMs, sleep } from "./rate-limits";

const COINGECKO_API = "https://api.coingecko.com/api/v3";

/**
 * Correspondances vérifiées à la main pour les actifs majeurs.
 *
 * Elles sont prioritaires sur le registre dynamique : plusieurs jetons peuvent
 * partager un même symbole (des dizaines de "UNI", "COMP", "GAS"…) et une
 * résolution automatique risquerait de retenir le mauvais.
 */
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

// ── Registre dynamique des actifs ───────────────────────────────────────────
// La table ci-dessus ne couvre que 21 actifs : tout portefeuille contenant un
// altcoin (ARB, OP, PEPE, TIA…) serait mal valorisé, faussant le calcul
// proportionnel du 150 VH bis. On complète donc avec les principaux actifs par
// capitalisation, récupérés une fois puis mis en cache.
//
// Le classement par capitalisation sert aussi d'arbitre en cas de symboles en
// double : entre deux jetons "GAS", on retient le plus capitalisé.

const REGISTRY_KEY = STORAGE_KEYS.assetRegistry;
const REGISTRY_TTL_MS = 30 * 24 * 3600 * 1000; // 30 jours : de nouveaux actifs apparaissent
const REGISTRY_PAGES = 2; // 2 × 250 = les 500 premières capitalisations

type RegistryPayload = { fetchedAt: number; map: Record<string, string> };

let dynamicRegistry: Record<string, string> = {};
let registryLoaded = false;
let registryWarming: Promise<void> | null = null;

function loadRegistryFromStorage(): RegistryPayload | null {
  const parsed = readJson<RegistryPayload | null>(REGISTRY_KEY, null);
  if (!parsed?.map || typeof parsed.fetchedAt !== "number") return null;
  return parsed;
}

/**
 * Charge le registre des actifs (cache local, sinon CoinGecko).
 * Idempotent et sûr en appels concurrents : les appels simultanés partagent
 * la même promesse.
 */
export function warmAssetRegistry(cgApiKey?: string): Promise<void> {
  if (registryLoaded) return Promise.resolve();
  if (registryWarming) return registryWarming;

  registryWarming = (async () => {
    const cached = loadRegistryFromStorage();
    if (cached && Date.now() - cached.fetchedAt < REGISTRY_TTL_MS) {
      dynamicRegistry = cached.map;
      registryLoaded = true;
      return;
    }

    const headers: Record<string, string> = {};
    if (cgApiKey) headers["x-cg-demo-api-key"] = cgApiKey;

    const map: Record<string, string> = {};
    try {
      for (let page = 1; page <= REGISTRY_PAGES; page++) {
        const res = await fetch(
          `${COINGECKO_API}/coins/markets?vs_currency=eur&order=market_cap_desc&per_page=250&page=${page}`,
          { headers }
        );
        if (!res.ok) break;
        const coins = (await res.json()) as Array<{ id: string; symbol: string }>;
        if (!Array.isArray(coins) || coins.length === 0) break;

        // Les pages arrivent par capitalisation décroissante : le premier
        // symbole rencontré est donc le plus capitalisé — on ne l'écrase pas.
        for (const coin of coins) {
          const symbol = coin.symbol?.toUpperCase();
          if (symbol && !map[symbol]) map[symbol] = coin.id;
        }
      }
    } catch {
      // Hors ligne ou API indisponible : on retombe sur la table statique,
      // et l'incertitude est signalée à l'utilisateur via portfolioValueCertain.
    }

    if (Object.keys(map).length > 0) {
      dynamicRegistry = map;
      writeJson(REGISTRY_KEY, { fetchedAt: Date.now(), map } satisfies RegistryPayload);
    } else if (cached) {
      // Rafraîchissement impossible : mieux vaut un registre périmé que rien
      dynamicRegistry = cached.map;
    }

    registryLoaded = true;
  })();

  return registryWarming;
}

/** Nombre d'actifs résolvables (table statique + registre dynamique). */
export function getKnownAssetCount(): number {
  return new Set([...Object.keys(CG_ASSET_MAP), ...Object.keys(dynamicRegistry)]).size;
}

export function getCoinGeckoId(asset: string): string | null {
  const symbol = asset.toUpperCase();
  return CG_ASSET_MAP[symbol] ?? dynamicRegistry[symbol] ?? null;
}

/** true si l'actif peut être valorisé au cours du marché. */
export function isAssetPriceable(asset: string): boolean {
  return getCoinGeckoId(asset) !== null;
}

// ── Cache des prix ──────────────────────────────────────────────────────────
// Un prix historique est immuable : le cours du BTC au 15-06-2023 ne changera
// jamais. On le persiste donc dans le localStorage pour éviter de refaire des
// centaines d'appels CoinGecko (throttlés à 1,5 s) à chaque rechargement de page.

const LS_KEY = STORAGE_KEYS.priceCache;

// Cache module-level : survit aux re-renders et aux navigations client
const priceCache = new Map<string, number>(); // "cgId|dateStr" -> prix EUR

let cacheLoaded = false;

function loadPersistentCache() {
  if (cacheLoaded || typeof window === "undefined") return;
  cacheLoaded = true;
  const parsed = readJson<Record<string, number>>(LS_KEY, {});
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "number" && Number.isFinite(value)) priceCache.set(key, value);
  }
}

/** Écriture différée : évite de sérialiser le cache à chaque prix reçu. */
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function persistCache() {
  if (typeof window === "undefined") return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    writeJson(LS_KEY, Object.fromEntries(priceCache));
  }, 500);
}

/** Vide le cache des prix historiques (mémoire + localStorage). */
export function clearPriceCache() {
  priceCache.clear();
  remove(LS_KEY);
}

/** Nombre de prix actuellement en cache — utilisé pour l'affichage dans l'UI. */
export function getPriceCacheSize(): number {
  loadPersistentCache();
  return priceCache.size;
}

/**
 * Récupère le prix EUR historique d'un actif à une date donnée.
 *
 * @param asset    - Symbole (ex: "BTC")
 * @param dateStr  - Date au format "DD-MM-YYYY"
 * @param cgApiKey - Clé API CoinGecko Demo optionnelle (réduit le délai)
 * @param delayMs  - Délai de throttle avant la requête (ms). Si omis, voir `coinGeckoThrottleMs`.
 */
export async function fetchHistoricalPriceEur(
  asset: string,
  dateStr: string,
  cgApiKey?: string,
  delayMs?: number
): Promise<number | null> {
  const id = getCoinGeckoId(asset);
  if (!id) return null;

  loadPersistentCache();

  const cacheKey = `${id}|${dateStr}`;
  // Cache hit → aucun appel réseau, donc aucun throttle à subir
  if (priceCache.has(cacheKey)) return priceCache.get(cacheKey)!;

  // Throttle avant la requête pour respecter les limites de l'API
  const waitMs = delayMs ?? coinGeckoThrottleMs(cgApiKey);
  await sleep(waitMs);

  const headers: Record<string, string> = {};
  if (cgApiKey) headers["x-cg-demo-api-key"] = cgApiKey;

  for (let attempt = 0; attempt < COINGECKO.maxRetries; attempt++) {
    // Exponential backoff sur les tentatives suivantes : 5s, 10s
    if (attempt > 0) await sleep(COINGECKO.retryBackoffMs * attempt);

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
      persistCache();
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
