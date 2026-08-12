import { test } from "node:test";
import assert from "node:assert/strict";

import { extractBaseAsset, canonicalAsset, pick, pickNumber, buildRow, parseDate, splitCsvLine, normalizeHeaders } from "./helpers";
import { CSV_PARSERS } from "./index";

// Les parsers sont résolus via le registre : ces tests valident donc aussi
// le câblage plateforme → parser, pas seulement l'analyse du CSV.
const parseBinanceCsv = CSV_PARSERS.binance;
const parseBitgetCsv = CSV_PARSERS.bitget;
const parseKrakenCsv = CSV_PARSERS.kraken;
const parseGateCsv = CSV_PARSERS.gate;
const parseKucoinCsv = CSV_PARSERS.kucoin;
const parseCoinbaseCsv = CSV_PARSERS.coinbase;

// ── extractBaseAsset ────────────────────────────────────────────────────────
// Régression : le regex d'origine renvoyait "BTCEUR" pour la paire "BTCEUR",
// rendant l'actif introuvable chez CoinGecko et faussant toutes les cessions.

test("extractBaseAsset — paires collées", () => {
  assert.equal(extractBaseAsset("BTCEUR"), "BTC");
  assert.equal(extractBaseAsset("BTCUSDT"), "BTC");
  assert.equal(extractBaseAsset("ETHUSDC"), "ETH");
  assert.equal(extractBaseAsset("MATICEUR"), "MATIC");
  assert.equal(extractBaseAsset("BTCFDUSD"), "BTC");
  // USDT doit primer sur USD, sinon "BTCUSDT" donnerait "BTCT"
  assert.equal(extractBaseAsset("DOGEUSDT"), "DOGE");
});

test("extractBaseAsset — séparateurs explicites", () => {
  assert.equal(extractBaseAsset("BTC-USDT"), "BTC");
  assert.equal(extractBaseAsset("ETH_USDT"), "ETH");
  assert.equal(extractBaseAsset("BTC/EUR"), "BTC");
});

test("extractBaseAsset — paires héritées Kraken", () => {
  assert.equal(extractBaseAsset("XXBTZEUR"), "BTC");
  assert.equal(extractBaseAsset("XETHZEUR"), "ETH");
});

test("extractBaseAsset — cas limites", () => {
  assert.equal(extractBaseAsset(""), "");
  assert.equal(extractBaseAsset("BTC"), "BTC");
  // Ne doit pas amputer un symbole plus court que sa devise de cotation
  assert.equal(extractBaseAsset("EUR"), "EUR");
});

test("canonicalAsset — alias de plateforme", () => {
  assert.equal(canonicalAsset("XBT"), "BTC");
  assert.equal(canonicalAsset("XDG"), "DOGE");
  assert.equal(canonicalAsset("sol"), "SOL");
});

// ── Lecture tolérante des colonnes ──────────────────────────────────────────

test("pick — insensible à la ponctuation des en-têtes", () => {
  const row = buildRow(normalizeHeaders(["Date(UTC)", "Order Id"]), ["2023-01-01", "abc"]);
  assert.equal(pick(row, "date(utc)"), "2023-01-01");
  assert.equal(pick(row, "date utc"), "2023-01-01");
  assert.equal(pick(row, "order id"), "abc");
});

test("pick — retombe sur l'alias suivant si la colonne est vide", () => {
  const row = buildRow(normalizeHeaders(["amount", "size"]), ["", "42"]);
  assert.equal(pick(row, "amount", "size"), "42");
});

test("pickNumber — formats européen et anglo-saxon", () => {
  const row = buildRow(
    normalizeHeaders(["a", "b", "c", "d", "e"]),
    ["1 234,56", "1,234.56", "1.234,56", "12.5", "abc"]
  );
  assert.equal(pickNumber(row, "a"), 1234.56);
  assert.equal(pickNumber(row, "b"), 1234.56);
  assert.equal(pickNumber(row, "c"), 1234.56);
  assert.equal(pickNumber(row, "d"), 12.5);
  assert.equal(pickNumber(row, "e"), 0);
});

test("splitCsvLine — respecte les guillemets", () => {
  assert.deepEqual(splitCsvLine('a,"b,c",d'), ["a", "b,c", "d"]);
});

test("parseDate — traite les dates sans fuseau comme UTC", () => {
  // Sinon une cession du 31/12 23:30 bascule d'année fiscale selon le fuseau
  const d = parseDate("2023-12-31 23:30:00");
  assert.equal(d?.toISOString(), "2023-12-31T23:30:00.000Z");
  assert.equal(parseDate("pas une date"), null);
});

// ── Parsers par plateforme ──────────────────────────────────────────────────

test("Binance — actif, sens et imposabilité", () => {
  const txs = parseBinanceCsv(
    `Date(UTC),Market,Type,Price,Amount,Total,Order Id
2023-06-15 10:00:00,BTCEUR,SELL,25000,0.5,12500,b1
2023-01-10 09:00:00,BTCEUR,BUY,20000,0.5,10000,b2`
  );
  assert.equal(txs.length, 2);
  assert.deepEqual(txs.map((t) => t.asset), ["BTC", "BTC"]);
  assert.deepEqual(txs.map((t) => t.type), ["sell", "buy"]);
  assert.deepEqual(txs.map((t) => t.isTaxable), [true, false]);
  assert.equal(txs[0].fiatAmount, 12500);
});

test("Bitget — paire collée en USDT", () => {
  const txs = parseBitgetCsv(
    `date,symbol,side,price,amount,total,order id
2023-06-15 10:00:00,BTCUSDT,sell,25000,0.5,12500,g1`
  );
  assert.equal(txs[0].asset, "BTC");
});

test("Kraken — paire héritée XXBTZEUR", () => {
  const txs = parseKrakenCsv(
    `txid,pair,time,type,price,cost,vol
k1,XXBTZEUR,2023-06-15 10:00:00,sell,25000,12500,0.5`
  );
  assert.equal(txs[0].asset, "BTC");
  assert.equal(txs[0].isTaxable, true);
});

test("Gate.io — paire séparée par underscore", () => {
  const txs = parseGateCsv(
    `createtime,pair,type,price,amount,total,ordernumber
2023-06-15 10:00:00,ETH_USDT,sell,1800,2,3600,x1`
  );
  assert.equal(txs[0].asset, "ETH");
});

test("KuCoin — paire séparée par tiret", () => {
  const txs = parseKucoinCsv(
    `tradeCreatedAt,symbol,side,price,amount,volume,orderId
2023-06-15 10:00:00,SOL-USDT,sell,20,10,200,k9`
  );
  assert.equal(txs[0].asset, "SOL");
  assert.equal(txs[0].qty, 10);
});

test("Coinbase — distingue vente et revenu de staking", () => {
  const txs = parseCoinbaseCsv(
    `Timestamp,Transaction Type,Asset,Quantity Transacted,Spot Price at Transaction,Subtotal
2023-06-15T10:00:00Z,Sell,BTC,0.5,25000,12500
2023-03-01T10:00:00Z,Rewards Income,ETH,0.1,1500,150`
  );
  assert.deepEqual(txs.map((t) => t.type), ["sell", "staking"]);
  assert.deepEqual(txs.map((t) => t.isTaxable), [true, false]);
});

test("les lignes à date invalide sont ignorées, pas importées à tort", () => {
  const txs = parseBinanceCsv(
    `Date(UTC),Market,Type,Price,Amount,Total,Order Id
,BTCEUR,SELL,25000,0.5,12500,b1
2023-01-10 09:00:00,BTCEUR,BUY,20000,0.5,10000,b2`
  );
  assert.equal(txs.length, 1);
  assert.equal(txs[0].id, "b2");
});

test("un CSV vide ou sans lignes ne produit rien", () => {
  assert.deepEqual(parseBinanceCsv(""), []);
  assert.deepEqual(parseBinanceCsv("Date(UTC),Market,Type"), []);
});
