import { getPlatform, type PlatformId } from "../platforms";
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
