export type TransactionPlatform = "binance" | "bitget" | "kraken" | "gate" | "kucoin" | "coinbase";

export type TransactionType = "buy" | "sell" | "trade" | "staking" | "mining" | "airdrop" | "other";

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
