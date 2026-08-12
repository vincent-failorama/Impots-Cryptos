import { Transaction } from "../types";
import { splitCsvLine, normalizeHeaders, buildRow, parseDate, pick, pickNumber } from "./helpers";

/**
 * Parser Coinbase — Account Statement CSV (Advanced Trade & Classic).
 *
 * Coinbase génère deux formats principaux :
 *
 * 1. "Transaction history" (Classic / Coinbase.com) :
 *    Timestamp | Transaction Type | Asset | Quantity Transacted | Spot Price Currency
 *    Spot Price at Transaction | Subtotal | Total (inclusive of fees and/or spread)
 *    Fees and/or Spread | Notes
 *
 * 2. "Advanced Trade" fills CSV :
 *    portfolio | trade id | product | side | created at | size | size unit
 *    price | fee | total | price/fee/total unit
 *
 * Le parser gère les deux formats via la normalisation des headers.
 */
export function parseCoinbaseCsv(csv: string): Transaction[] {
  // Coinbase Classic insère parfois des lignes de commentaire au début (commençant par "You can")
  const lines = csv.trim().split(/\r?\n/).filter((l) => !l.startsWith("You ") && l.trim() !== "");
  if (lines.length <= 1) return [];

  const rawHeaders = splitCsvLine(lines[0]);
  const headers = normalizeHeaders(rawHeaders);

  return lines.slice(1).flatMap((line, index) => {
    const values = splitCsvLine(line);
    const row = buildRow(headers, values);

    // ── Date ──────────────────────────────────────────────────────────────
    const date = parseDate(
      pick(row, "timestamp", "created at", "date", "time")
    );
    if (!date) return [];

    // ── Actif ─────────────────────────────────────────────────────────────
    // Classic : colonne "asset" directe
    // Advanced Trade : "product" de la forme "BTC-EUR" ou "ETH-USD"
    let asset = pick(row, "asset", "currency", "base asset").toUpperCase();
    if (!asset) {
      const product = pick(row, "product", "symbol", "pair").toUpperCase();
      [asset] = product.split("-");
    }
    if (!asset) return [];

    // ── Type de transaction ───────────────────────────────────────────────
    const rawType = pick(row, "transaction type", "type", "side").toLowerCase();

    // Coinbase Classic types : "Buy", "Sell", "Convert", "Rewards Income", "Learning Reward"…
    let txType: Transaction["type"] = "other";
    let isTaxable = false;

    if (rawType === "buy" || rawType === "advanced trade buy") {
      txType = "buy";
    } else if (rawType === "sell" || rawType === "advanced trade sell") {
      txType = "sell";
      isTaxable = true;
    } else if (rawType === "convert") {
      txType = "trade";
      isTaxable = true;
    } else if (["rewards income", "staking income", "interest income"].includes(rawType)) {
      // BNC — revenu de staking imposable à la réception, non taxable au titre des plus-values
      txType = "staking";
    } else if (["learning reward", "airdrop", "fork"].includes(rawType)) {
      txType = "airdrop";
    } else if (rawType === "mining income") {
      txType = "mining";
    }
    // "receive", "send", etc. → "other", non taxable

    // ── Quantité ──────────────────────────────────────────────────────────
    const qty = Math.abs(pickNumber(row, "quantity transacted", "size", "amount", "quantity"));

    // ── Montant fiat ──────────────────────────────────────────────────────
    // Classic : "subtotal" (hors frais) ou "total (inclusive of fees and/or spread)"
    // Advanced Trade : "total" (signé, négatif pour achat)
    const fiatAmount = Math.abs(
      pickNumber(row, "subtotal", "total (inclusive of fees and/or spread)", "total")
    );

    // ── Prix unitaire ─────────────────────────────────────────────────────
    const price =
      pickNumber(row, "spot price at transaction", "price") || (qty ? fiatAmount / qty : 0);

    const id =
      pick(row, "trade id", "order id", "id", "notes") ||
      `coinbase-${index}-${date.valueOf()}`;

    const tx: Transaction = {
      id,
      date,
      platform: "coinbase",
      asset,
      qty,
      priceEur: price,
      fiatAmount,
      type: txType,
      isTaxable,
    };
    return [tx];
  });
}
