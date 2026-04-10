import { Transaction } from "../types";
import { splitCsvLine, normalizeHeaders, buildRow, parseDate } from "./helpers";

export function parseBitgetCsv(csv: string): Transaction[] {
  const rows = csv.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length <= 1) return [];

  const rawHeaders = splitCsvLine(rows[0]);
  const headers = normalizeHeaders(rawHeaders);

  return rows.slice(1).flatMap((line, index) => {
    const values = splitCsvLine(line);
    const row = buildRow(headers, values);

    const symbol = (row["symbol"] || row["pair"] || "").toUpperCase();
    const [base] = symbol.match(/^[A-Z0-9]+/) || ["UNKNOWN"];
    const side = (row["side"] || row["type"] || "").toLowerCase();

    const date = parseDate(row["date"] || row["time"] || "");
    if (!date) return [];

    const qty = Number(row["amount"] || row["vol"] || "0") || 0;
    const fiatAmount = Number(row["total"] || row["cost"] || "0") || 0;
    const price = Number(row["price"] || "0") || (qty ? fiatAmount / qty : 0);

    const tx: Transaction = {
      id: row["order id"] || `bitget-${index}-${date.valueOf()}`,
      date,
      platform: "bitget",
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
