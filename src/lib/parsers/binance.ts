import { Transaction } from "../types";
import { splitCsvLine, normalizeHeaders, buildRow, parseDate } from "./helpers";

export function parseBinanceCsv(csv: string): Transaction[] {
  const rows = csv.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length <= 1) return [];

  const rawHeaders = splitCsvLine(rows[0]);
  const headers = normalizeHeaders(rawHeaders);

  return rows.slice(1).flatMap((line, index) => {
    const values = splitCsvLine(line);
    const row = buildRow(headers, values);

    const market = row["market"] || row["symbol"] || "";
    const [base] = market.match(/^[A-Z0-9]+/i) || ["UNKNOWN"];
    const typeValue = (row["type"] || row["side"] || "").toLowerCase();

    const date = parseDate(row["date(utc)"] || row["date"] || "");
    if (!date) return []; // ignorer les lignes avec date invalide

    const qty = Number(row["amount"] || row["vol"] || "0") || 0;
    const fiatAmount = Number(row["total"] || row["cost"] || "0") || 0;
    const price = Number(row["price"] || "0") || (qty ? fiatAmount / qty : 0);

    const tx: Transaction = {
      id: row["order id"] || row["trade id"] || `binance-${index}-${date.valueOf()}`,
      date,
      platform: "binance",
      asset: base.toUpperCase(),
      qty,
      priceEur: price,
      fiatAmount,
      type: typeValue === "buy" ? "buy" : typeValue === "sell" ? "sell" : "trade",
      isTaxable: typeValue === "sell" || typeValue === "trade",
    };
    return [tx];
  });
}
