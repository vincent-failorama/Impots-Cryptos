import { test } from "node:test";
import assert from "node:assert/strict";

import { CSV_PARSERS } from "./index";
import { normalizeSide } from "./generic";

/**
 * Plateformes les plus utilisées en France.
 *
 * Les libellés de colonnes reproduits ici viennent de la documentation
 * publique et des formats observés ; ils n'ont pas été confrontés à un export
 * réel de chaque plateforme. Ces tests garantissent donc le câblage et le
 * comportement du parser, pas l'exactitude des libellés attendus — un format
 * qui changerait produirait un import vide, signalé dans l'interface avec la
 * liste des colonnes réellement trouvées.
 */

// ── Vocabulaire du sens d'opération ─────────────────────────────────────────

test("normalizeSide — vocabulaire anglais", () => {
  assert.equal(normalizeSide("BUY"), "buy");
  assert.equal(normalizeSide("sell"), "sell");
  assert.equal(normalizeSide("Bought"), "buy");
  assert.equal(normalizeSide("Advanced Trade Sell"), "sell");
});

test("normalizeSide — vocabulaire français", () => {
  assert.equal(normalizeSide("Achat"), "buy");
  assert.equal(normalizeSide("Vente"), "sell");
  assert.equal(normalizeSide("achat au comptant"), "buy");
});

test("normalizeSide — les libellés ambigus ne deviennent pas des cessions", () => {
  // Un virement entrant n'est pas une acquisition à titre onéreux : le compter
  // comme un achat gonflerait le prix de revient global.
  for (const ambiguous of ["IN", "OUT", "Transfer", "Reward", "Deposit", "Withdrawal", ""]) {
    assert.equal(normalizeSide(ambiguous), "trade", `« ${ambiguous} » ne doit pas être typé`);
  }
});

// ── Bitpanda ────────────────────────────────────────────────────────────────

test("Bitpanda — colonne Asset et montant fiat séparé", () => {
  const txs = CSV_PARSERS.bitpanda(
    `Transaction ID,Timestamp,Transaction Type,Asset,Amount Asset,Amount Fiat,Asset market price
bp-1,2023-06-15 10:00:00,sell,BTC,0.5,12500,25000
bp-2,2023-01-10 09:00:00,buy,ETH,2,3000,1500`
  );
  assert.equal(txs.length, 2);
  assert.deepEqual(txs.map((t) => t.asset), ["BTC", "ETH"]);
  assert.deepEqual(txs.map((t) => t.type), ["sell", "buy"]);
  assert.deepEqual(txs.map((t) => t.isTaxable), [true, false]);
  assert.equal(txs[0].fiatAmount, 12500);
});

// ── Coinhouse (libellés français) ───────────────────────────────────────────

test("Coinhouse — en-têtes en français", () => {
  const txs = CSV_PARSERS.coinhouse(
    `Date,Type,Devise,Quantité,Prix,Montant,Référence
2023-06-15 10:00:00,Vente,BTC,0.5,25000,12500,ch-1
2023-01-10 09:00:00,Achat,BTC,0.5,20000,10000,ch-2`
  );
  assert.equal(txs.length, 2);
  assert.deepEqual(txs.map((t) => t.type), ["sell", "buy"]);
  assert.deepEqual(txs.map((t) => t.isTaxable), [true, false]);
  assert.equal(txs[0].asset, "BTC");
  assert.equal(txs[0].id, "ch-1");
});

test("Coinhouse — montants au format français (virgule décimale)", () => {
  const txs = CSV_PARSERS.coinhouse(
    `Date,Type,Devise,Quantité,Prix,Montant,Référence
2023-06-15 10:00:00,Vente,BTC,"0,5","25000,00","12500,50",ch-3`
  );
  assert.equal(txs[0].qty, 0.5);
  assert.equal(txs[0].fiatAmount, 12500.5);
});

// ── Crypto.com ──────────────────────────────────────────────────────────────

test("Crypto.com — export Exchange (une ligne par ordre)", () => {
  const txs = CSV_PARSERS.cryptocom(
    `Timestamp (UTC),Pair,Side,Price,Quantity,Total,Trade ID
2023-06-15 10:00:00,BTC_EUR,SELL,25000,0.5,12500,cro-1
2023-01-10 09:00:00,ETHEUR,BUY,1500,2,3000,cro-2`
  );
  assert.deepEqual(txs.map((t) => t.asset), ["BTC", "ETH"]);
  assert.deepEqual(txs.map((t) => t.type), ["sell", "buy"]);
});

// ── Revolut ─────────────────────────────────────────────────────────────────

test("Revolut — relevé par crypto-actif", () => {
  const txs = CSV_PARSERS.revolut(
    `Symbol,Type,Quantity,Price,Value,Date
BTC,SELL,0.5,25000,12500,2023-06-15 10:00:00
BTC,BUY,0.5,20000,10000,2023-01-10 09:00:00`
  );
  assert.equal(txs.length, 2);
  assert.deepEqual(txs.map((t) => t.asset), ["BTC", "BTC"]);
  assert.deepEqual(txs.map((t) => t.isTaxable), [true, false]);
});

// ── Swissborg ───────────────────────────────────────────────────────────────

test("Swissborg — achats et ventes reconnus", () => {
  const txs = CSV_PARSERS.swissborg(
    `Local time,Type,Currency,Net amount,Price,Value (EUR),ID
2023-06-15 10:00:00,Sell,BTC,0.5,25000,12500,sb-1
2023-01-10 09:00:00,Buy,BTC,0.5,20000,10000,sb-2`
  );
  assert.deepEqual(txs.map((t) => t.type), ["sell", "buy"]);
  assert.equal(txs[0].fiatAmount, 12500);
});

test("Swissborg — les récompenses Earn sont des revenus BNC, pas des cessions", () => {
  const txs = CSV_PARSERS.swissborg(
    `Local time,Type,Currency,Net amount,Price,Value (EUR),ID
2023-04-01 10:00:00,Earn reward,BTC,0.01,25000,250,sb-3`
  );
  // Imposable en BNC à la réception (case 5HQ), jamais comme plus-value
  assert.equal(txs[0].type, "staking");
  assert.equal(txs[0].isTaxable, false);
  assert.equal(txs[0].fiatAmount, 250);
});

// ── Ledger Live ─────────────────────────────────────────────────────────────

test("Ledger Live — les mouvements ne sont jamais imposables", () => {
  // L'export Ledger Live décrit des entrées/sorties de portefeuille, pas des
  // ordres : les importer comme cessions produirait des plus-values fictives.
  const txs = CSV_PARSERS.ledgerlive(
    `Operation Date,Currency Ticker,Operation Type,Operation Amount,Countervalue at Operation Date,Operation Hash
2023-06-15 10:00:00,BTC,OUT,0.5,12500,0xabc
2023-01-10 09:00:00,BTC,IN,0.5,10000,0xdef`
  );
  assert.equal(txs.length, 2);
  assert.equal(txs[0].asset, "BTC");
  for (const tx of txs) {
    assert.equal(tx.type, "trade");
    assert.equal(tx.isTaxable, false, "un mouvement de portefeuille n'est pas une cession");
  }
});

// ── Couverture globale ──────────────────────────────────────────────────────

test("les 12 plateformes disposent d'un parser opérationnel", () => {
  const ids = Object.keys(CSV_PARSERS);
  assert.equal(ids.length, 12);
  for (const id of ids) {
    const parser = CSV_PARSERS[id as keyof typeof CSV_PARSERS];
    // Un CSV vide ne doit jamais lever, quelle que soit la plateforme
    assert.deepEqual(parser(""), [], `${id} : un CSV vide doit renvoyer une liste vide`);
  }
});
