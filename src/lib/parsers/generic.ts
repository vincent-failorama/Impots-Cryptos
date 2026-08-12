import type { CsvColumnMap, PlatformId } from "../platforms";
import type { Transaction } from "../types";
import {
  buildRow,
  extractBaseAsset,
  normalizeHeaders,
  parseDate,
  pick,
  pickNumber,
  splitCsvLine,
} from "./helpers";

/**
 * Parser CSV générique pour les exports « une ligne = un ordre ».
 *
 * Binance, Bitget, Gate.io et Kraken produisent la même structure : une date,
 * une paire, un sens, une quantité, un total et un prix. Seuls les libellés de
 * colonnes diffèrent — ils sont décrits en données dans le registre des
 * plateformes (`csvColumns`), ce qui évite de recopier ce parcours quatre fois.
 *
 * Les formats portant une logique propre (Coinbase et ses catégories de
 * revenus, KuCoin et ses variantes) gardent un parser dédié.
 */
export function createCsvParser(
  platform: PlatformId,
  columns: CsvColumnMap
): (csv: string) => Transaction[] {
  return function parse(csv: string): Transaction[] {
    const lines = csv.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length <= 1) return [];

    const headers = normalizeHeaders(splitCsvLine(lines[0]));

    return lines.slice(1).flatMap((line, index) => {
      const row = buildRow(headers, splitCsvLine(line));

      // Une ligne sans date exploitable n'est pas importable : on l'ignore
      // plutôt que de lui inventer une date, qui fausserait l'année fiscale.
      const date = parseDate(pick(row, ...columns.date));
      if (!date) return [];

      const asset = extractBaseAsset(pick(row, ...columns.pair)) || "UNKNOWN";
      const side = pick(row, ...columns.side).toLowerCase();

      const qty = pickNumber(row, ...columns.qty);
      const fiatAmount = pickNumber(row, ...columns.total);
      const priceEur =
        pickNumber(row, ...columns.price) || (qty ? fiatAmount / qty : 0);

      const type: Transaction["type"] =
        side === "buy" ? "buy" : side === "sell" ? "sell" : "trade";

      const tx: Transaction = {
        id: pick(row, ...columns.id) || `${platform}-${index}-${date.valueOf()}`,
        date,
        platform,
        asset,
        qty,
        priceEur,
        fiatAmount,
        type,
        // Seules les cessions contre monnaie fiat sont imposables : les échanges
        // crypto→crypto bénéficient du sursis d'imposition (art. 150 VH bis CGI).
        isTaxable: type === "sell",
      };
      return [tx];
    });
  };
}
