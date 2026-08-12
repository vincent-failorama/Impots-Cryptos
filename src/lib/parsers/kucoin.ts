import { Transaction } from "../types";
import { splitCsvLine, normalizeHeaders, buildRow, parseDate, extractBaseAsset, pick, pickNumber } from "./helpers";

/**
 * Parser KuCoin — Spot Trade History CSV.
 *
 * Colonnes attendues (export "Trade History" depuis l'interface KuCoin) :
 *   tradeCreatedAt | symbol | side | price | amount | volume | fee | feeCurrency | orderId
 *
 * Variantes observées :
 *   - "Order Created Time" au lieu de "tradeCreatedAt"
 *   - "size" au lieu de "amount"
 *   - "funds" ou "total" au lieu de "volume"
 *   - "uid" au lieu de "orderId"
 *
 * Le symbole KuCoin est de la forme "BTC-USDT" ou "ETH-EUR".
 * On extrait la base (avant le tiret) comme actif.
 */
export function parseKucoinCsv(csv: string): Transaction[] {
  const rows = csv.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length <= 1) return [];

  const rawHeaders = splitCsvLine(rows[0]);
  const headers = normalizeHeaders(rawHeaders);

  return rows.slice(1).flatMap((line, index) => {
    const values = splitCsvLine(line);
    const row = buildRow(headers, values);

    // Date : plusieurs noms de colonnes possibles
    const date = parseDate(
      pick(row, "tradecreatedat", "order created time", "filled time", "time", "date")
    );
    if (!date) return [];

    // Symbole : "BTC-USDT" → base = "BTC"
    const base = extractBaseAsset(pick(row, "symbol", "pair", "trading pair"));
    if (!base) return [];

    const side = pick(row, "side", "type", "direction").toLowerCase();

    // Quantité (actif cédé/acheté)
    const qty = pickNumber(row, "amount", "size", "filled amount", "quantity", "vol");

    // Montant fiat (contrepartie en devise de cotation)
    const fiatAmount = pickNumber(row, "volume", "funds", "filled volume", "total", "cost");

    const price = pickNumber(row, "price", "avg price", "filled price") || (qty ? fiatAmount / qty : 0);

    const id = pick(row, "orderid", "order id", "uid", "tradeid") || `kucoin-${index}-${date.valueOf()}`;

    const tx: Transaction = {
      id,
      date,
      platform: "kucoin",
      asset: base,
      qty,
      priceEur: price,
      fiatAmount,
      type: side === "buy" ? "buy" : side === "sell" ? "sell" : "trade",
      // Sursis d'imposition sur les échanges crypto→crypto (art. 150 VH bis CGI).
      isTaxable: side === "sell",
    };
    return [tx];
  });
}
