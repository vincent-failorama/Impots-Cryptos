import { Transaction, TransactionType, TransactionPlatform } from "../types";
import { QUOTE_CURRENCIES_BY_LENGTH } from "../quote-currencies";

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
 * Libellés de colonnes présents dans un CSV, tels qu'écrits par la plateforme.
 *
 * Sert au diagnostic : quand un import ne produit aucune transaction, la cause
 * la plus fréquente est un libellé de colonne inconnu de nos alias. Les afficher
 * transforme un « 0 transaction trouvée » opaque en information exploitable.
 */
export function readCsvHeaders(csv: string): string[] {
  const firstLine = csv.trim().split(/\r?\n/).find((l) => l.trim() !== "");
  if (!firstLine) return [];
  return splitCsvLine(firstLine).filter((h) => h.trim() !== "");
}

/**
 * Construit un objet row depuis des headers normalisés.
 * La clé est toujours en lowercase, les valeurs restent telles quelles.
 *
 * Chaque colonne est indexée deux fois : sous son libellé normalisé, et sous
 * une forme réduite aux caractères alphanumériques. Ainsi "Date(UTC)",
 * "Date (UTC)" et "date_utc" partagent la clé "dateutc", ce qui rend le parsing
 * insensible aux variations de ponctuation entre exports.
 */
export function buildRow(headers: string[], values: string[]): Record<string, string> {
  const row: Record<string, string> = {};
  headers.forEach((h, i) => {
    const value = (values[i] ?? "").trim();
    if (row[h] === undefined) row[h] = value;
    const squashed = squash(h);
    if (squashed && row[squashed] === undefined) row[squashed] = value;
  });
  return row;
}

/** Réduit un libellé de colonne à ses seuls caractères alphanumériques. */
function squash(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Retourne la première colonne non vide parmi les alias fournis.
 *
 * Les exports changent de libellé selon la plateforme, la langue et la version
 * ("Amount", "Quantity", "Qté", "size"…). Tester une liste d'alias évite qu'un
 * simple renommage de colonne vide silencieusement l'import.
 */
export function pick(row: Record<string, string>, ...aliases: string[]): string {
  for (const alias of aliases) {
    const direct = row[alias.toLowerCase()];
    if (direct !== undefined && direct !== "") return direct;
    const squashed = row[squash(alias)];
    if (squashed !== undefined && squashed !== "") return squashed;
  }
  return "";
}

/** Variante numérique de `pick`, tolérante aux formats européens ("1 234,56"). */
export function pickNumber(row: Record<string, string>, ...aliases: string[]): number {
  const raw = pick(row, ...aliases);
  if (!raw) return 0;
  // Retire espaces, insécables et symboles monétaires, puis gère la virgule décimale
  let cleaned = raw.replace(/[\s  €$]/g, "").replace(/[A-Za-z]+$/, "");
  if (cleaned.includes(",") && cleaned.includes(".")) {
    // "1.234,56" (européen) vs "1,234.56" (anglo-saxon) : le dernier séparateur décide
    cleaned = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (cleaned.includes(",")) {
    cleaned = cleaned.replace(",", ".");
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
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


/**
 * Extrait l'actif de base d'une paire de trading.
 *
 * Les exports CSV utilisent des formats hétérogènes :
 *   - collé      : "BTCEUR", "BTCUSDT"   (Binance, Bitget)
 *   - séparateur : "BTC-USDT", "ETH_USDT", "BTC/EUR" (KuCoin, Gate.io, Coinbase)
 *   - hérité     : "XXBTZEUR", "XETHZEUR" (Kraken)
 *
 * Sans cette normalisation, l'actif reste "BTCEUR" — absent de la table
 * CoinGecko — et la valorisation du portefeuille (art. 150 VH bis) est faussée.
 *
 * @returns le symbole de base en majuscules, ou "" si la paire est vide.
 */
export function extractBaseAsset(pair: string): string {
  const raw = (pair || "").trim().toUpperCase();
  if (!raw) return "";

  // 1. Séparateur explicite → la base est le premier segment
  const separated = raw.split(/[-_/\s]/).filter(Boolean);
  if (separated.length > 1) return canonicalAsset(separated[0]);

  let base = separated[0] ?? "";

  // 2. Préfixes/suffixes hérités Kraken (XXBTZEUR → XBT)
  //    Le "Z" préfixe les devises fiat, le "X" les cryptos.
  const krakenMatch = base.match(/^X([A-Z0-9]{3,})Z([A-Z]{3})$/);
  if (krakenMatch) return canonicalAsset(krakenMatch[1]);

  // 3. Suffixe de cotation collé (BTCEUR → BTC)
  for (const quote of QUOTE_CURRENCIES_BY_LENGTH) {
    if (base.length > quote.length && base.endsWith(quote)) {
      base = base.slice(0, -quote.length);
      break;
    }
  }

  return canonicalAsset(base);
}

/** Ramène les alias de plateforme au symbole usuel (XBT → BTC, XDG → DOGE). */
export function canonicalAsset(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s === "XBT" || s === "XXBT") return "BTC";
  if (s === "XDG" || s === "XXDG") return "DOGE";
  if (s === "XETH") return "ETH";
  return s;
}
