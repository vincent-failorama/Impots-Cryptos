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

/**
 * Libellés désignant un revenu reçu sans contrepartie : staking, minage,
 * récompense, parrainage… Ces revenus sont imposables en BNC à la date de
 * réception (case 5HQ), indépendamment des plus-values de cession.
 *
 * Jusqu'ici seul l'export Coinbase les identifiait : les revenus Binance Earn,
 * Kraken Staking ou Swissborg Earn étaient importés comme opérations neutres
 * et n'apparaissaient dans aucune déclaration.
 */
const INCOME_TERMS: Array<{ pattern: RegExp; type: "staking" | "mining" | "airdrop" }> = [
  { pattern: /\b(staking|stake|earn|epargne|interest|interet|yield|lending)\b/, type: "staking" },
  { pattern: /\b(mining|minage|miner|pool)\b/, type: "mining" },
  { pattern: /\b(airdrop|reward|recompense|bonus|referral|parrainage|cashback|distribution)\b/, type: "airdrop" },
];

/**
 * Retire les diacritiques : « Épargne » et « Récompense » se comparent alors
 * comme leurs équivalents non accentués. Nécessaire aussi parce que `\b` ne
 * reconnaît pas les lettres accentuées comme des caractères de mot — un motif
 * `\bépargne\b` ne correspondrait jamais.
 */
function deaccent(input: string): string {
  return input.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Reconnaît un revenu passif dans le libellé d'opération.
 * @returns le type BNC correspondant, ou `null` si ce n'en est pas un.
 */
export function detectIncomeType(raw: string): "staking" | "mining" | "airdrop" | null {
  const cleaned = deaccent(raw.trim().toLowerCase());
  if (!cleaned) return null;
  for (const { pattern, type } of INCOME_TERMS) {
    if (pattern.test(cleaned)) return type;
  }
  return null;
}

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

      const rawSide = pick(row, ...columns.side);
      // Un revenu passif prime sur le sens de l'opération : « Staking Reward »
      // n'est ni un achat ni une vente, mais un revenu imposable en BNC.
      const incomeType = detectIncomeType(rawSide);
      const type: Transaction["type"] = incomeType ?? normalizeSide(rawSide);

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

      // Les frais ne sont retenus que si l'export les libelle en euros :
      // convertir des frais payés en BNB ou en KCS demanderait un cours à la
      // date exacte, et une valeur approximative fausserait le prix de cession.
      const feeAmount = columns.fee ? pickNumber(row, ...columns.fee) : 0;
      if (feeAmount > 0) {
        const feeCurrency = columns.feeCurrency
          ? pick(row, ...columns.feeCurrency).toUpperCase()
          : "";
        if (!feeCurrency || feeCurrency === "EUR") {
          tx.feeEur = feeAmount;
        }
      }

      return [tx];
    });
  };
}
