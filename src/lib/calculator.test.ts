import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { calculateCessions, computeBNCIncome, computeTotalGain, computeTotalTaxable } from "./calculator";
import { Transaction } from "./types";

/**
 * Les tests du moteur de calcul doivent être déterministes : on neutralise donc
 * le réseau (CoinGecko) et on injecte les cours voulus. `window.localStorage`
 * est simulé pour que le registre d'actifs et le cache de prix fonctionnent.
 */
type PriceTable = Record<string, number>; // id CoinGecko -> prix EUR

function mockEnvironment(prices: PriceTable, registry: Record<string, string> = {}) {
  const store: Record<string, string> = {
    "crypto-tax-asset-registry": JSON.stringify({ fetchedAt: Date.now(), map: registry }),
  };
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    },
  };
  (globalThis as unknown as { fetch: unknown }).fetch = async (url: string) => {
    const id = Object.keys(prices).find((key) => url.includes(`/coins/${key}/`));
    return {
      ok: true,
      status: 200,
      json: async () => ({ market_data: { current_price: { eur: id ? prices[id] : 0 } } }),
    };
  };
}

const tx = (o: Partial<Transaction>): Transaction => ({
  id: o.id ?? Math.random().toString(36).slice(2),
  date: new Date("2023-01-01"),
  platform: "binance",
  asset: "BTC",
  qty: 0,
  priceEur: 0,
  fiatAmount: 0,
  type: "buy",
  isTaxable: false,
  ...o,
});

beforeEach(() => {
  mockEnvironment({ bitcoin: 25000, ethereum: 1500 });
});

// ── Formule 150 VH bis ──────────────────────────────────────────────────────

test("plus-value = prix de cession - (prix de revient global x cession / valeur du portefeuille)", async () => {
  // 1 BTC acheté 10 000 €, revendu pour moitié à 12 500 € quand 1 BTC vaut 25 000 €
  // Portefeuille = 25 000 ; fraction = 12 500/25 000 = 0,5
  // Coût imputé = 10 000 x 0,5 = 5 000 ; plus-value = 12 500 - 5 000 = 7 500
  const res = await calculateCessions([
    tx({ date: new Date("2023-01-10"), qty: 1, priceEur: 10000, fiatAmount: 10000, type: "buy" }),
    tx({ date: new Date("2023-06-15"), qty: 0.5, priceEur: 25000, fiatAmount: 12500, type: "sell", isTaxable: true }),
  ]);

  assert.equal(res.length, 1);
  assert.equal(Math.round(res[0].acquisitionCost), 5000);
  assert.equal(Math.round(res[0].gainLoss), 7500);
  assert.equal(res[0].portfolioValueCertain, true);
});

test("une moins-value n'est pas comptée dans le montant imposable", async () => {
  const res = await calculateCessions([
    tx({ date: new Date("2023-01-10"), qty: 1, priceEur: 30000, fiatAmount: 30000, type: "buy" }),
    tx({ date: new Date("2023-06-15"), qty: 1, priceEur: 25000, fiatAmount: 25000, type: "sell", isTaxable: true }),
  ]);

  assert.ok(res[0].gainLoss < 0, "la cession doit produire une moins-value");
  assert.equal(res[0].taxableAmount, 0);
  assert.equal(computeTotalTaxable(res), 0);
  assert.ok(computeTotalGain(res) < 0);
});

// ── Sursis d'imposition (art. 150 VH bis, II-A) ─────────────────────────────

test("un échange crypto→crypto ne génère aucune cession imposable", async () => {
  const res = await calculateCessions([
    tx({ date: new Date("2023-01-10"), asset: "BTC", qty: 1, priceEur: 10000, fiatAmount: 10000, type: "buy" }),
    tx({
      date: new Date("2023-03-10"), asset: "BTC", qty: 1, type: "trade", isTaxable: false,
      receivedAsset: "ETH", receivedQty: 10, receivedValueEur: 15000,
    }),
  ]);

  assert.equal(res.length, 0);
});

test("le prix de revient global est reporté à travers l'échange", async () => {
  // Achat 1 BTC à 10 000 € -> échange contre 10 ETH -> vente des 10 ETH à 15 000 €
  // Le coût imputé doit rester fondé sur les 10 000 € d'origine.
  const res = await calculateCessions([
    tx({ date: new Date("2023-01-10"), asset: "BTC", qty: 1, priceEur: 10000, fiatAmount: 10000, type: "buy" }),
    tx({
      date: new Date("2023-03-10"), asset: "BTC", qty: 1, type: "trade", isTaxable: false,
      receivedAsset: "ETH", receivedQty: 10, receivedValueEur: 15000,
    }),
    tx({ date: new Date("2023-09-10"), asset: "ETH", qty: 10, priceEur: 1500, fiatAmount: 15000, type: "sell", isTaxable: true }),
  ]);

  assert.equal(res.length, 1);
  assert.equal(Math.round(res[0].acquisitionCost), 10000);
  assert.equal(Math.round(res[0].gainLoss), 5000);
});

test("les holdings suivent l'échange : le BTC cédé ne reste pas au portefeuille", async () => {
  const res = await calculateCessions([
    tx({ date: new Date("2023-01-10"), asset: "BTC", qty: 1, priceEur: 10000, fiatAmount: 10000, type: "buy" }),
    tx({
      date: new Date("2023-03-10"), asset: "BTC", qty: 1, type: "trade", isTaxable: false,
      receivedAsset: "ETH", receivedQty: 10, receivedValueEur: 15000,
    }),
    tx({ date: new Date("2023-09-10"), asset: "ETH", qty: 5, priceEur: 1500, fiatAmount: 7500, type: "sell", isTaxable: true }),
  ]);

  // Portefeuille attendu : 10 ETH x 1 500 = 15 000 (et non 15 000 + 1 BTC fantôme)
  assert.equal(Math.round(res[0].portfolioValueAtSale), 15000);
});

// ── Signalement des valorisations incertaines ───────────────────────────────

test("un actif inconnu de CoinGecko rend la valeur du portefeuille incertaine", async () => {
  // Régression : l'actif hors référentiel était valorisé à son prix d'achat,
  // sous-évaluant le portefeuille et faussant la plus-value — sans alerte.
  const res = await calculateCessions([
    tx({ date: new Date("2023-01-10"), asset: "BTC", qty: 1, priceEur: 10000, fiatAmount: 10000, type: "buy" }),
    tx({ date: new Date("2023-01-11"), asset: "ZZZ", qty: 1000, priceEur: 5, fiatAmount: 5000, type: "buy" }),
    tx({ date: new Date("2023-06-15"), asset: "BTC", qty: 0.5, priceEur: 25000, fiatAmount: 12500, type: "sell", isTaxable: true }),
  ]);

  assert.equal(res[0].portfolioValueCertain, false);
});

test("la valeur du portefeuille ne peut pas être inférieure au produit de cession", async () => {
  const res = await calculateCessions([
    tx({ date: new Date("2023-01-10"), asset: "BTC", qty: 1, priceEur: 10000, fiatAmount: 10000, type: "buy" }),
    tx({ date: new Date("2023-06-15"), asset: "BTC", qty: 1, priceEur: 99000, fiatAmount: 99000, type: "sell", isTaxable: true }),
  ]);

  assert.ok(res[0].portfolioValueAtSale >= res[0].grossProceeds);
  assert.equal(res[0].portfolioValueCertain, false);
});

// ── Revenus BNC ─────────────────────────────────────────────────────────────

test("staking, mining et airdrop sont isolés en BNC et triés par date", () => {
  const bnc = computeBNCIncome([
    tx({ date: new Date("2023-05-01"), asset: "ETH", qty: 0.1, priceEur: 1500, fiatAmount: 150, type: "staking" }),
    tx({ date: new Date("2023-02-01"), asset: "BTC", qty: 0.01, priceEur: 20000, fiatAmount: 200, type: "mining" }),
    tx({ date: new Date("2023-01-10"), asset: "BTC", qty: 1, priceEur: 10000, fiatAmount: 10000, type: "buy" }),
  ]);

  assert.equal(bnc.length, 2);
  assert.deepEqual(bnc.map((b) => b.type), ["mining", "staking"]);
  assert.equal(bnc[0].incomeEur, 200);
});

test("sans montant fiat, le revenu BNC retombe sur quantité x prix unitaire", () => {
  const bnc = computeBNCIncome([
    tx({ date: new Date("2023-05-01"), asset: "ETH", qty: 2, priceEur: 1500, fiatAmount: 0, type: "airdrop" }),
  ]);

  assert.equal(bnc[0].incomeEur, 3000);
});

test("les acquisitions par staking entrent dans le prix de revient global", async () => {
  // 1 BTC acheté 10 000 € + 1 ETH reçu en staking valorisé 1 500 €
  // Prix de revient global = 11 500 €
  const res = await calculateCessions([
    tx({ date: new Date("2023-01-10"), asset: "BTC", qty: 1, priceEur: 10000, fiatAmount: 10000, type: "buy" }),
    tx({ date: new Date("2023-02-01"), asset: "ETH", qty: 1, priceEur: 1500, fiatAmount: 1500, type: "staking" }),
    tx({ date: new Date("2023-06-15"), asset: "BTC", qty: 1, priceEur: 25000, fiatAmount: 25000, type: "sell", isTaxable: true }),
  ]);

  // Portefeuille = 1 BTC (25 000) + 1 ETH (1 500) = 26 500
  // Coût imputé = 11 500 x (25 000/26 500) = 10 849
  assert.equal(Math.round(res[0].globalCostBasisBefore), 11500);
  assert.equal(Math.round(res[0].acquisitionCost), 10849);
});

// ── Robustesse ──────────────────────────────────────────────────────────────

test("les transactions sont traitées par ordre chronologique quel que soit l'ordre d'entrée", async () => {
  const res = await calculateCessions([
    tx({ date: new Date("2023-06-15"), qty: 0.5, priceEur: 25000, fiatAmount: 12500, type: "sell", isTaxable: true }),
    tx({ date: new Date("2023-01-10"), qty: 1, priceEur: 10000, fiatAmount: 10000, type: "buy" }),
  ]);

  assert.equal(Math.round(res[0].gainLoss), 7500);
});

test("une liste vide ne produit aucune cession", async () => {
  assert.deepEqual(await calculateCessions([]), []);
});
