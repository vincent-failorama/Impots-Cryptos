import { Transaction } from "../types";
import { splitCsvLine, normalizeHeaders, buildRow, parseDate } from "./helpers";

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
      row["tradecreatedat"] ||
      row["order created time"] ||
      row["time"] ||
      row["date"] ||
      ""
    );
    if (!date) return [];

    // Symbole : "BTC-USDT" → base = "BTC"
    const symbol = (row["symbol"] || row["pair"] || "").toUpperCase();
    const [base] = symbol.split("-");
    if (!base) return [];

    const side = (row["side"] || row["type"] || "").toLowerCase();

    // Quantité (actif cédé/acheté)
    const qty =
      Number(row["amount"] || row["size"] || row["vol"] || "0") || 0;

    // Montant fiat (contrepartie en devise de cotation)
    const fiatAmount =
      Number(row["volume"] || row["funds"] || row["total"] || row["cost"] || "0") || 0;

    const price =
      Number(row["price"] || "0") || (qty ? fiatAmount / qty : 0);

    const id =
      row["orderid"] ||
      row["order id"] ||
      row["uid"] ||
      row["tradeid"] ||
      `kucoin-${index}-${date.valueOf()}`;

    const tx: Transaction = {
      id,
      date,
      platform: "kucoin",
      asset: base,
      qty,
      priceEur: price,
      fiatAmount,
      type: side === "buy" ? "buy" : side === "sell" ? "sell" : "trade",
      isTaxable: side === "sell" || side === "trade",
    };
    return [tx];
  });
}
