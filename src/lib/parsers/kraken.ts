import { Transaction } from "../types";
import { splitCsvLine, normalizeHeaders, buildRow, parseDate } from "./helpers";

export function parseKrakenCsv(csv: string): Transaction[] {
  const rows = csv.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length <= 1) return [];

  const rawHeaders = splitCsvLine(rows[0]);
  const headers = normalizeHeaders(rawHeaders);

  return rows.slice(1).flatMap((line, index) => {
    const values = splitCsvLine(line);
    const row = buildRow(headers, values);

    const pair = (row["pair"] || "").toUpperCase();
    // Kraken format: XBTZEUR, ETHEUR, etc. Extraire la base (avant la devise fiat)
    const [base] = pair.replace(/EUR$|USD$|GBP$|CHF$/, "").match(/^X?([A-Z0-9]+)/) || ["UNKNOWN"];

    const kind = (row["type"] || "").toLowerCase();
    const date = parseDate(row["time"] || row["date"] || "");
    if (!date) return [];

    const qty = Number(row["vol"] || row["volume"] || "0") || 0;
    const fiatAmount = Number(row["cost"] || row["total"] || "0") || 0;
    const price = Number(row["price"] || "0") || (qty ? fiatAmount / qty : 0);

    const tx: Transaction = {
      id: row["txid"] || `kraken-${index}-${date.valueOf()}`,
      date,
      platform: "kraken",
      asset: base,
      qty,
      priceEur: price,
      fiatAmount,
      type: kind === "buy" ? "buy" : kind === "sell" ? "sell" : "trade",
      isTaxable: kind === "sell" || kind === "trade",
    };
    return [tx];
  });
}
