import { Transaction, TransactionType, TransactionPlatform } from "../types";

export function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.length) {
    values.push(current.trim());
  }

  return values;
}

/**
 * Normalise les headers CSV : trim + lowercase pour une comparaison robuste.
 * Les exports varient selon la région et la version de la plateforme.
 */
export function normalizeHeaders(headers: string[]): string[] {
  return headers.map((h) => h.trim().toLowerCase());
}

/**
 * Construit un objet row depuis des headers normalisés.
 * La clé est toujours en lowercase, les valeurs restent telles quelles.
 */
export function buildRow(headers: string[], values: string[]): Record<string, string> {
  return Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? "").trim()]));
}

/**
 * Parse une date CSV en traitant les chaînes sans timezone comme UTC.
 *
 * Problème : `new Date("2023-12-31 23:30:00")` est interprété en heure locale
 * par les navigateurs (spec ECMAScript). Pour Paris (UTC+1/+2), une transaction
 * Binance/Kraken de fin d'année peut glisser d'une année fiscale à l'autre.
 *
 * Fix : si la chaîne ressemble à "YYYY-MM-DD HH:mm:ss" sans suffixe timezone,
 * on la normalise en ISO 8601 UTC explicite ("YYYY-MM-DDTHH:mm:ssZ").
 * Les formats qui incluent déjà un timezone (ex: Coinbase avec "Z") ne sont pas affectés.
 */
export function parseDate(raw: string): Date | null {
  if (!raw) return null;
  // Normalise "YYYY-MM-DD HH:mm:ss" (avec ou sans millisecondes) en UTC explicite
  const normalized = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw.trim())
    ? raw.trim().replace(' ', 'T') + 'Z'
    : raw.trim();
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

export function toTransaction(
  platform: TransactionPlatform,
  row: Record<string, string>,
  defaults: Partial<Transaction> = {}
): Transaction {
  const date = parseDate(row.date || row["date(utc)"] || row.time || "") ?? new Date(0);
  const qty = Number(row.qty ?? row.amount ?? row.vol ?? "0") || 0;
  const fiatAmount = Number(row.fiatamount ?? row.total ?? row.cost ?? "0") || 0;
  const priceEur = Number(row.priceeur ?? row.price ?? "0") || (qty ? fiatAmount / qty : 0);
  return {
    id: row.id || row["order id"] || row["order id"] || row.txid || `${platform}-${date.valueOf()}-${Math.random().toString(36).slice(2, 8)}`,
    platform,
    date,
    asset: (row.asset || row.symbol || row.pair || "").toUpperCase(),
    qty,
    priceEur,
    fiatAmount,
    type: (row.type as TransactionType) || "other",
    isTaxable: defaults.isTaxable ?? false,
  };
}

export function normalizeAsset(symbol: string) {
  return symbol.replace(/\s+/g, "").replace(/\//g, "").toUpperCase();
}
