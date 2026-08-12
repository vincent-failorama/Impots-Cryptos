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
/**
 * Vocabulaires reconnus pour le sens d'une opération.
 *
 * Les plateformes européennes et françaises n'écrivent pas « buy » / « sell » :
 * on rencontre « Achat », « Vente », « Kauf », « Compra »…
 *
 * Volontairement restreint aux verbes sans ambiguïté. Un libellé non reconnu
 * (« IN », « OUT », « Transfer », « Reward »…) devient un `trade` non imposable
 * plutôt que d'être forcé en achat ou en vente : un virement entrant n'est pas
 * une acquisition à titre onéreux, et le compter comme tel gonflerait le prix
 * de revient global. Mieux vaut une ligne neutre qu'une ligne fausse.
 */
const BUY_TERMS = new Set([
  "buy", "bought", "purchase", "achat", "acheter", "acheté",
  "kauf", "compra", "acquisto", "koop",
]);

const SELL_TERMS = new Set([
  "sell", "sold", "sale", "vente", "vendre", "vendu",
  "verkauf", "venta", "vendita", "verkoop",
]);

export function normalizeSide(raw: string): "buy" | "sell" | "trade" {
  // On isole le premier mot : « Advanced Trade Buy » ou « Achat au comptant »
  const cleaned = raw.trim().toLowerCase();
  if (BUY_TERMS.has(cleaned)) return "buy";
  if (SELL_TERMS.has(cleaned)) return "sell";

  for (const word of cleaned.split(/[\s_-]+/)) {
    if (BUY_TERMS.has(word)) return "buy";
    if (SELL_TERMS.has(word)) return "sell";
  }
  return "trade";
}

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

      const qty = pickNumber(row, ...columns.qty);
      const fiatAmount = pickNumber(row, ...columns.total);
      const priceEur =
        pickNumber(row, ...columns.price) || (qty ? fiatAmount / qty : 0);

      const type: Transaction["type"] = normalizeSide(pick(row, ...columns.side));

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
