import { Transaction } from "./types";
import { CG_ASSET_MAP, fetchHistoricalPriceEur } from "./pricer";

export type BNCResult = {
  id: string;
  date: Date;
  platform: Transaction["platform"];
  asset: string;
  qty: number;
  /** Valeur EUR au moment de la réception — base de l'imposition BNC */
  incomeEur: number;
  type: "staking" | "mining" | "airdrop";
};

/**
 * Retourne les revenus BNC (staking, mining, airdrop) triés par date.
 * Ces revenus sont imposables à la réception en catégorie BNC (case 5HQ),
 * indépendamment des plus-values (150 VH bis).
 */
export function computeBNCIncome(transactions: Transaction[]): BNCResult[] {
  return transactions
    .filter((tx): tx is Transaction & { type: "staking" | "mining" | "airdrop" } =>
      tx.type === "staking" || tx.type === "mining" || tx.type === "airdrop"
    )
    .map(tx => ({
      id: tx.id,
      date: tx.date,
      platform: tx.platform,
      asset: tx.asset,
      qty: tx.qty,
      incomeEur: tx.fiatAmount > 0 ? tx.fiatAmount : tx.qty * tx.priceEur,
      type: tx.type,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

export type CessionResult = {
  id: string;
  date: Date;
  platform: Transaction["platform"];
  asset: string;
  qty: number;
  grossProceeds: number;
  acquisitionCost: number;
  gainLoss: number;
  taxableAmount: number;
  isTaxable: boolean;
  /** Valeur globale du portefeuille au moment de la cession (Article 150 VH bis) */
  portfolioValueAtSale: number;
  /** Prix de revient global avant cette cession */
  globalCostBasisBefore: number;
  /**
   * true si tous les prix du portefeuille au moment de la cession ont été
   * obtenus via CoinGecko. false si au moins un actif a utilisé un prix de
   * fallback (lastKnownPrice), ce qui peut sous-estimer la valeur globale.
   */
  portfolioValueCertain: boolean;
};

export function parseCsvNumber(value: string): number {
  const normalized = value.replace(/\s+/g, "").replace(/,/g, ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function toDateStr(date: Date): string {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

/**
 * Phase 1 (CPU pur) : simule les holdings pour déterminer quelles paires
 * (actif, date) seront nécessaires lors du calcul des cessions.
 * Ne fait aucun appel réseau.
 */
function collectNeededPrices(sorted: Transaction[]): Array<{ asset: string; dateStr: string }> {
  const holdings = new Map<string, number>();
  const needed = new Set<string>(); // "ASSET|DD-MM-YYYY"

  const isAcquisition = (type: string) =>
    type === "buy" || type === "staking" || type === "mining" || type === "airdrop";

  for (const tx of sorted) {
    if (isAcquisition(tx.type)) {
      holdings.set(tx.asset, (holdings.get(tx.asset) ?? 0) + tx.qty);
    }

    if (tx.isTaxable && (tx.type === "sell" || tx.type === "trade")) {
      const dateStr = toDateStr(tx.date);
      for (const [asset, qty] of holdings) {
        if (qty > 0 && CG_ASSET_MAP[asset.toUpperCase()]) {
          needed.add(`${asset}|${dateStr}`);
        }
      }
      // Mise à jour des holdings après la cession
      holdings.set(tx.asset, Math.max(0, (holdings.get(tx.asset) ?? 0) - tx.qty));
      if (tx.type === "trade" && tx.receivedAsset && tx.receivedQty) {
        holdings.set(tx.receivedAsset, (holdings.get(tx.receivedAsset) ?? 0) + tx.receivedQty);
      }
    }
  }

  return Array.from(needed).map(s => {
    const [asset, dateStr] = s.split("|");
    return { asset, dateStr };
  });
}

/**
 * Phase 2 : récupère tous les prix nécessaires avec throttling et retry.
 * Retourne une Map "ASSET|dateStr" → prix EUR.
 */
async function prefetchPrices(
  pairs: Array<{ asset: string; dateStr: string }>,
  cgApiKey: string | undefined,
  onProgress: (msg: string) => void
): Promise<Map<string, number>> {
  const cache = new Map<string, number>();
  const delay = cgApiKey ? 500 : 1500;

  for (let i = 0; i < pairs.length; i++) {
    const { asset, dateStr } = pairs[i];
    onProgress(`Chargement des prix : ${i + 1}/${pairs.length} — ${asset} le ${dateStr}…`);
    const price = await fetchHistoricalPriceEur(asset, dateStr, cgApiKey, delay);
    if (price !== null) {
      cache.set(`${asset}|${dateStr}`, price);
    }
  }

  return cache;
}

/**
 * Calcule les cessions selon l'article 150 VH bis du CGI (méthode française).
 *
 * Formule : Plus-value = Prix de cession − (Prix de revient global × Prix de cession / Valeur globale du portefeuille)
 *
 * Fonctionnement en 3 phases :
 *   1. Simulation CPU des holdings → liste des paires (actif, date) nécessaires
 *   2. Pré-chargement de tous les prix CoinGecko en une seule passe (avec throttling + retry)
 *   3. Calcul des cessions sans appel réseau dans la boucle principale
 */
export async function calculateCessions(
  transactions: Transaction[],
  onProgress?: (msg: string) => void,
  cgApiKey?: string
): Promise<CessionResult[]> {
  const sorted = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());

  // ── Phase 1 + 2 : pré-chargement des prix ────────────────────────────────
  const neededPairs = collectNeededPrices(sorted);
  let priceMap = new Map<string, number>();

  if (neededPairs.length > 0) {
    onProgress?.(`Pré-chargement de ${neededPairs.length} prix historiques CoinGecko…`);
    priceMap = await prefetchPrices(neededPairs, cgApiKey, onProgress ?? (() => {}));
    onProgress?.("Calcul des cessions…");
  }

  // ── Phase 3 : calcul synchrone (aucun appel réseau dans la boucle) ───────
  const holdings = new Map<string, number>();
  const lastKnownPrice = new Map<string, number>();
  let globalCostBasis = 0;
  const cessions: CessionResult[] = [];

  for (const tx of sorted) {
    const isBuy = tx.type === "buy";
    const isTrade = tx.type === "trade";
    const isSell = tx.type === "sell";

    // ── Acquisitions (achats + staking/mining/airdrop reçus) ────────────────
    // Le staking, mining et airdrop sont des BNC à la réception, mais entrent
    // dans le prix de revient global pour les futures cessions (art. 150 VH bis).
    if (isBuy || tx.type === "staking" || tx.type === "mining" || tx.type === "airdrop") {
      const cost = tx.fiatAmount > 0 ? tx.fiatAmount : tx.qty * tx.priceEur;
      globalCostBasis += cost;
      holdings.set(tx.asset, (holdings.get(tx.asset) ?? 0) + tx.qty);
      if (tx.priceEur > 0) lastKnownPrice.set(tx.asset, tx.priceEur);
    }

    // ── Cessions imposables ──────────────────────────────────────────────────
    if (tx.isTaxable && (isSell || isTrade)) {
      const grossProceeds = tx.fiatAmount > 0 ? tx.fiatAmount : tx.qty * tx.priceEur;
      if (tx.priceEur > 0) lastKnownPrice.set(tx.asset, tx.priceEur);

      const dateStr = toDateStr(tx.date);
      let portfolioValue = 0;
      let portfolioValueCertain = true;

      for (const [heldAsset, heldQty] of holdings) {
        if (heldQty <= 0) continue;
        const cgPrice = priceMap.get(`${heldAsset}|${dateStr}`);
        if (cgPrice === undefined && CG_ASSET_MAP[heldAsset.toUpperCase()]) {
          // Actif connu de CoinGecko mais prix non obtenu → valeur incertaine
          portfolioValueCertain = false;
        }
        const price = cgPrice ?? lastKnownPrice.get(heldAsset) ?? 0;
        if (cgPrice !== undefined) lastKnownPrice.set(heldAsset, cgPrice);
        portfolioValue += heldQty * price;
      }

      if (portfolioValue < grossProceeds) {
        portfolioValue = grossProceeds;
        portfolioValueCertain = false;
      }

      const globalCostBasisBefore = globalCostBasis;
      const fraction = grossProceeds / portfolioValue;
      const acquisitionCost = globalCostBasis * fraction;
      const gainLoss = grossProceeds - acquisitionCost;
      globalCostBasis = Math.max(0, globalCostBasis - acquisitionCost);

      const held = holdings.get(tx.asset) ?? 0;
      const newQty = Math.max(0, held - tx.qty);
      if (newQty === 0) holdings.delete(tx.asset);
      else holdings.set(tx.asset, newQty);

      // Trade crypto→crypto : enregistrer l'acquisition de l'actif reçu APRÈS la cession
      if (isTrade && tx.receivedAsset && tx.receivedQty) {
        const receivedValue = tx.receivedValueEur ?? tx.receivedQty * (lastKnownPrice.get(tx.receivedAsset) ?? 0);
        globalCostBasis += grossProceeds;
        holdings.set(tx.receivedAsset, (holdings.get(tx.receivedAsset) ?? 0) + tx.receivedQty);
        if (receivedValue > 0 && tx.receivedQty > 0) {
          lastKnownPrice.set(tx.receivedAsset, receivedValue / tx.receivedQty);
        } else if (tx.receivedQty > 0) {
          lastKnownPrice.set(tx.receivedAsset, grossProceeds / tx.receivedQty);
        }
      }

      cessions.push({
        id: tx.id,
        date: tx.date,
        platform: tx.platform,
        asset: tx.asset,
        qty: tx.qty,
        grossProceeds,
        acquisitionCost,
        gainLoss,
        taxableAmount: gainLoss > 0 ? gainLoss : 0,
        isTaxable: tx.isTaxable,
        portfolioValueAtSale: portfolioValue,
        globalCostBasisBefore,
        portfolioValueCertain,
      });
    }
  }

  return cessions;
}

export function computeTotalGain(results: CessionResult[]) {
  return results.reduce((sum, row) => sum + row.gainLoss, 0);
}

export function computeTotalTaxable(results: CessionResult[]) {
  return results.reduce((sum, row) => sum + row.taxableAmount, 0);
}
