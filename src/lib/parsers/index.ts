import { getPlatform, type CsvColumnMap, type PlatformId } from "../platforms";
import type { Transaction } from "../types";

import { createCsvParser } from "./generic";
import { parseCoinbaseCsv } from "./coinbase";
import { parseKucoinCsv } from "./kucoin";

export type CsvParser = (csv: string) => Transaction[];

/**
 * Construit le parser générique d'une plateforme à partir des libellés de
 * colonnes déclarés dans le registre.
 */
function fromRegistry(id: PlatformId): CsvParser {
  const { csvColumns } = getPlatform(id);
  if (!csvColumns) {
    throw new Error(
      `La plateforme « ${id} » n'a ni csvColumns dans le registre, ni parser dédié.`
    );
  }
  return createCsvParser(id, csvColumns);
}

/**
 * Parser CSV par plateforme.
 *
 * Le type `Record<PlatformId, …>` impose l'exhaustivité : ajouter une
 * plateforme au registre sans lui associer de parser casse la compilation,
 * au lieu de produire silencieusement un import vide.
 */
export const CSV_PARSERS: Record<PlatformId, CsvParser> = {
  // Formats « une ligne = un ordre » : parser générique piloté par le registre.
  binance: fromRegistry("binance"),
  bitget: fromRegistry("bitget"),
  bitpanda: fromRegistry("bitpanda"),
  coinhouse: fromRegistry("coinhouse"),
  cryptocom: fromRegistry("cryptocom"),
  gate: fromRegistry("gate"),
  kraken: fromRegistry("kraken"),
  ledgerlive: fromRegistry("ledgerlive"),
  revolut: fromRegistry("revolut"),
  swissborg: fromRegistry("swissborg"),
  // Formats à logique propre : parser dédié (voir chaque module).
  coinbase: parseCoinbaseCsv,
  kucoin: parseKucoinCsv,
};

export function parseCsv(platform: PlatformId, csv: string): Transaction[] {
  return CSV_PARSERS[platform](csv);
}

/**
 * Analyse un CSV avec une correspondance de colonnes fournie par l'utilisateur.
 *
 * Les libellés attendus par défaut proviennent de la documentation de chaque
 * plateforme et peuvent être démentis par un export réel — un format modifié
 * rendrait alors l'import impossible. Plutôt que de dépendre entièrement de ces
 * suppositions, l'utilisateur peut désigner lui-même ses colonnes : le parser
 * générique fonctionne à l'identique, seules les sources changent.
 */
export function parseCsvWithColumns(
  platform: PlatformId,
  csv: string,
  columns: CsvColumnMap
): Transaction[] {
  return createCsvParser(platform, columns)(csv);
}

/** Champs qu'une correspondance manuelle doit renseigner. */
export const COLUMN_FIELDS = [
  { key: "date", label: "Date de l'opération", required: true },
  { key: "pair", label: "Actif ou paire", required: true },
  { key: "side", label: "Sens (achat / vente)", required: true },
  { key: "qty", label: "Quantité", required: true },
  { key: "total", label: "Montant total", required: false },
  { key: "price", label: "Prix unitaire", required: false },
  { key: "id", label: "Identifiant d'ordre", required: false },
] as const satisfies readonly { key: keyof CsvColumnMap; label: string; required: boolean }[];

/** Construit une correspondance exploitable depuis les choix de l'utilisateur. */
export function buildColumnMap(selection: Partial<Record<keyof CsvColumnMap, string>>): CsvColumnMap {
  const field = (key: keyof CsvColumnMap): readonly string[] => {
    const chosen = selection[key];
    return chosen ? [chosen] : [];
  };
  return {
    date: field("date"),
    pair: field("pair"),
    side: field("side"),
    qty: field("qty"),
    total: field("total"),
    price: field("price"),
    id: field("id"),
  };
}
