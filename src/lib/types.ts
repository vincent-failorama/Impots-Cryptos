import type { PlatformId } from "./platforms";

/** Dérivé du registre des plateformes — voir `platforms.ts`. */
export type TransactionPlatform = PlatformId;

export const TRANSACTION_TYPES = [
  "buy",
  "sell",
  "trade",
  "staking",
  "mining",
  "airdrop",
  "other",
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export function isTransactionType(value: unknown): value is TransactionType {
  return typeof value === "string" && (TRANSACTION_TYPES as readonly string[]).includes(value);
}

export type Transaction = {
  id: string;
  date: Date;
  platform: TransactionPlatform;
  asset: string;
  qty: number;
  priceEur: number;
  fiatAmount: number;
  type: TransactionType;
  isTaxable: boolean;
  /** For crypto→crypto trades: asset received */
  receivedAsset?: string;
  /** For crypto→crypto trades: qty received */
  receivedQty?: number;
  /** For crypto→crypto trades: EUR value of the received asset */
  receivedValueEur?: number;
};
