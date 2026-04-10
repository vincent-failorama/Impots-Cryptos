import { NextResponse } from "next/server";
import crypto from "crypto";
import { Transaction } from "@/lib/types";

const BASE_URL = "https://api.kucoin.com";

async function kucoinFetch<T>(
  path: string,
  apiKey: string,
  apiSecret: string,
  apiPassphrase?: string,
  queryParams?: Record<string, string>
): Promise<T | null> {
  const method = "GET";
  const timestamp = Date.now().toString();
  const queryString = queryParams ? "?" + new URLSearchParams(queryParams).toString() : "";
  const fullPath = path + queryString;

  const strToSign = timestamp + method + fullPath;
  const signature = crypto.createHmac("sha256", apiSecret).update(strToSign).digest("base64");

  // Pour KuCoin API V2, la passphrase doit être chiffrée
  const passphraseSign = apiPassphrase
    ? crypto.createHmac("sha256", apiSecret).update(apiPassphrase).digest("base64")
    : "";

  const headers: Record<string, string> = {
    "KC-API-KEY": apiKey,
    "KC-API-SIGN": signature,
    "KC-API-TIMESTAMP": timestamp,
    "KC-API-KEY-VERSION": "2",
    "Content-Type": "application/json",
  };

  if (passphraseSign) {
    headers["KC-API-PASSPHRASE"] = passphraseSign;
  }

  const res = await fetch(`${BASE_URL}${fullPath}`, { method, headers });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erreur API KuCoin (${res.status}) : ${text}`);
  }

  const json = await res.json();
  if (json.code !== "200000") {
    throw new Error(`Erreur API KuCoin : ${json.msg}`);
  }
  return json.data as T;
}

type KuCoinFill = {
  symbol: string;
  tradeId: string;
  side: "buy" | "sell";
  price: string;
  size: string;
  funds: string;
  createdAt: number;
};

type KuCoinFillsResponse = {
  currentPage: number;
  pageSize: number;
  totalPage: number;
  items: KuCoinFill[];
};

function toTransaction(fill: KuCoinFill): Transaction | null {
  if (!fill.symbol) return null;
  const parts = fill.symbol.split("-");
  const baseAsset = parts[0];

  const date = new Date(fill.createdAt);
  const type = fill.side === "buy" ? "buy" : "sell";
  const priceEur = Number(fill.price);
  const qty = Number(fill.size);
  const fiatAmount = Number(fill.funds) || qty * priceEur;

  return {
    id: `kucoin-${fill.tradeId}`,
    date,
    platform: "kucoin",
    asset: baseAsset.toUpperCase(),
    qty,
    priceEur,
    fiatAmount,
    type,
    isTaxable: type === "sell",
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 }); }

  const { apiKey, apiSecret, apiPassphrase } = body as Record<string, string>;
  if (!apiKey || !apiSecret) return NextResponse.json({ error: "apiKey et apiSecret sont requis" }, { status: 400 });

  try {
    const transactions: Transaction[] = [];
    let currentPage = 1, hasMore = true;
    while (hasMore) {
      const result = await kucoinFetch<KuCoinFillsResponse>("/api/v1/fills", apiKey, apiSecret, apiPassphrase, { currentPage: currentPage.toString(), pageSize: "500" });
      if (!result || !result.items || result.items.length === 0) break;
      result.items.forEach(fill => { const tx = toTransaction(fill); if (tx) transactions.push(tx); });
      if (currentPage >= result.totalPage) hasMore = false; else currentPage++;
    }
    transactions.sort((a, b) => a.date.getTime() - b.date.getTime());
    return NextResponse.json({ transactions, count: transactions.length });
  } catch (err: any) { return NextResponse.json({ error: err.message || "Erreur KuCoin" }, { status: 502 }); }
}