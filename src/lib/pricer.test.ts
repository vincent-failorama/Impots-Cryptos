import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * `pricer` porte un état de module (cache des cours, registre d'actifs). Le
 * `localStorage` simulé est donc installé avant tout accès, et le registre
 * pré-rempli une fois pour toutes : les lectures sont paresseuses, aucune
 * requête réseau n'est émise tant qu'un cours manquant n'est pas demandé.
 *
 * Le registre de test mêle volontairement des actifs absents de la table curée
 * (PEPE, ARB, TIA) et un BTC usurpé, pour vérifier l'ordre de priorité.
 */
const store: Record<string, string> = {
  "crypto-tax-asset-registry": JSON.stringify({
    fetchedAt: Date.now(),
    map: { BTC: "un-jeton-usurpateur", PEPE: "pepe", ARB: "arbitrum", TIA: "celestia" },
  }),
};

(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  },
};

let fetchCalls = 0;
function mockFetch(eur = 25000) {
  fetchCalls = 0;
  (globalThis as unknown as { fetch: unknown }).fetch = async () => {
    fetchCalls++;
    return {
      ok: true,
      status: 200,
      json: async () => ({ market_data: { current_price: { eur } } }),
    };
  };
}

type Pricer = typeof import("./pricer");
let cached: Pricer | null = null;

/** Chargement paresseux : `await` de premier niveau indisponible ici. */
async function loadPricer(): Promise<Pricer> {
  cached ??= await import("./pricer");
  return cached;
}

// ── Résolution des actifs ───────────────────────────────────────────────────

test("getKnownAssetCount s'hydrate depuis le cache local, sans réseau", async () => {
  const pricer = await loadPricer();
  // Régression : la fonction renvoyait 21 tant qu'aucun calcul n'avait tourné,
  // affichant un décompte trompeur dans l'interface.
  (globalThis as unknown as { fetch: unknown }).fetch = async () => {
    throw new Error("aucun appel réseau ne doit être émis");
  };
  // 21 actifs curés + PEPE, ARB, TIA (BTC figure déjà dans la table curée)
  assert.equal(pricer.getKnownAssetCount(), 24);
  assert.equal(pricer.getCoinGeckoId("PEPE"), "pepe");
  assert.equal(pricer.getCoinGeckoId("ARB"), "arbitrum");
});

test("la table curée prime sur le registre dynamique", async () => {
  const pricer = await loadPricer();
  // Un symbole peut désigner plusieurs jetons : les majeurs restent arbitrés
  // à la main pour éviter qu'une résolution automatique retienne le mauvais.
  assert.equal(pricer.getCoinGeckoId("BTC"), "bitcoin");
  assert.equal(pricer.getCoinGeckoId("SOL"), "solana");
});

test("un actif inconnu n'est pas résolu", async () => {
  const pricer = await loadPricer();
  assert.equal(pricer.getCoinGeckoId("ZZZNOTACOIN"), null);
  assert.equal(pricer.isAssetPriceable("ZZZNOTACOIN"), false);
  assert.equal(pricer.isAssetPriceable("BTC"), true);
});

test("la résolution est insensible à la casse", async () => {
  const pricer = await loadPricer();
  assert.equal(pricer.getCoinGeckoId("btc"), "bitcoin");
  assert.equal(pricer.getCoinGeckoId("pepe"), "pepe");
});

// ── Cache des cours ─────────────────────────────────────────────────────────

test("le cache évite un second appel réseau et le délai de throttle", async () => {
  const pricer = await loadPricer();
  pricer.clearPriceCache();
  mockFetch(25000);

  const first = await pricer.fetchHistoricalPriceEur("BTC", "15-06-2023", undefined, 0);
  const startedAt = Date.now();
  const second = await pricer.fetchHistoricalPriceEur("BTC", "15-06-2023", undefined, 1500);
  const elapsed = Date.now() - startedAt;

  assert.equal(first, 25000);
  assert.equal(second, 25000);
  assert.equal(fetchCalls, 1, "le second appel doit être servi par le cache");
  assert.ok(elapsed < 100, "un cache hit ne doit pas subir le délai de throttle");
});

test("vider le cache force une nouvelle récupération", async () => {
  const pricer = await loadPricer();
  pricer.clearPriceCache();
  mockFetch(25000);

  await pricer.fetchHistoricalPriceEur("BTC", "20-06-2023", undefined, 0);
  assert.equal(pricer.getPriceCacheSize(), 1);

  pricer.clearPriceCache();
  assert.equal(pricer.getPriceCacheSize(), 0);

  await pricer.fetchHistoricalPriceEur("BTC", "20-06-2023", undefined, 0);
  assert.equal(fetchCalls, 2, "après purge, le cours doit être redemandé");
});

test("un actif hors référentiel ne déclenche aucun appel réseau", async () => {
  const pricer = await loadPricer();
  pricer.clearPriceCache();
  mockFetch(25000);

  const price = await pricer.fetchHistoricalPriceEur("ZZZNOTACOIN", "15-06-2023", undefined, 0);

  assert.equal(price, null);
  assert.equal(fetchCalls, 0, "inutile d'interroger CoinGecko pour un actif inconnu");
});
