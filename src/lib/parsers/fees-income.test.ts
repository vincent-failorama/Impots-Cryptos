import { test } from "node:test";
import assert from "node:assert/strict";

import { CSV_PARSERS } from "./index";
import { detectIncomeType } from "./generic";

// ── Détection des revenus BNC ───────────────────────────────────────────────
// Auparavant, seul l'export Coinbase identifiait ces revenus : le staking
// Binance, Kraken ou Swissborg n'apparaissait dans aucune déclaration.

test("detectIncomeType — staking et rendement", () => {
  for (const label of ["Staking Reward", "staking", "Earn", "Épargne", "Interest", "Lending"]) {
    assert.equal(detectIncomeType(label), "staking", `« ${label} »`);
  }
});

test("detectIncomeType — minage", () => {
  assert.equal(detectIncomeType("Mining payout"), "mining");
  assert.equal(detectIncomeType("Minage"), "mining");
});

test("detectIncomeType — récompenses et airdrops", () => {
  for (const label of ["Airdrop", "Reward", "Récompense", "Referral bonus", "Cashback"]) {
    assert.equal(detectIncomeType(label), "airdrop", `« ${label} »`);
  }
});

test("detectIncomeType — un achat ou une vente n'est pas un revenu", () => {
  for (const label of ["buy", "sell", "Achat", "Vente", "Transfer", ""]) {
    assert.equal(detectIncomeType(label), null, `« ${label} »`);
  }
});

test("un revenu de staking est importé comme BNC, non comme cession", () => {
  const txs = CSV_PARSERS.binance(
    `Date(UTC),Market,Type,Price,Amount,Total,Order Id
2023-04-01 10:00:00,ETHEUR,Staking Reward,1500,0.1,150,s1
2023-06-15 10:00:00,ETHEUR,SELL,1800,1,1800,s2`
  );

  assert.equal(txs[0].type, "staking");
  assert.equal(txs[0].isTaxable, false, "un revenu BNC n'est pas une cession");
  assert.equal(txs[1].type, "sell");
  assert.equal(txs[1].isTaxable, true);
});

// ── Frais ───────────────────────────────────────────────────────────────────

test("les frais en euros sont retenus", () => {
  const txs = CSV_PARSERS.kraken(
    `txid,pair,time,type,price,cost,vol,fee,fee currency
k1,XXBTZEUR,2023-06-15 10:00:00,sell,25000,12500,0.5,25,EUR`
  );

  assert.equal(txs[0].feeEur, 25);
});

test("des frais libellés en crypto sont ignorés plutôt qu'approximés", () => {
  // Convertir des frais payés en BNB demanderait le cours à la date exacte :
  // une valeur approximative fausserait le prix de cession.
  const txs = CSV_PARSERS.binance(
    `Date(UTC),Market,Type,Price,Amount,Total,Order Id,Fee,Fee Coin
2023-06-15 10:00:00,BTCEUR,SELL,25000,0.5,12500,b1,0.01,BNB`
  );

  assert.equal(txs[0].feeEur, undefined);
});

test("des frais sans devise précisée sont supposés en euros", () => {
  const txs = CSV_PARSERS.coinhouse(
    `Date,Type,Devise,Quantité,Prix,Montant,Référence,Frais
2023-06-15 10:00:00,Vente,BTC,0.5,25000,12500,ch-1,15`
  );

  assert.equal(txs[0].feeEur, 15);
});

test("l'absence de colonne de frais ne pose pas de problème", () => {
  const txs = CSV_PARSERS.binance(
    `Date(UTC),Market,Type,Price,Amount,Total,Order Id
2023-06-15 10:00:00,BTCEUR,SELL,25000,0.5,12500,b1`
  );

  assert.equal(txs[0].feeEur, undefined);
});
