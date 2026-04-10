import { NextResponse } from "next/server";
import crypto from "crypto";
import { Transaction } from "@/lib/types";

const BASE_URL = "https://api.coinbase.com";

function getCoinbaseSignature(requestPath: string, method: string, secret: string, timestamp: string, body: string = "") {
  const message = timestamp + method + requestPath + body;
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

async function coinbaseFetch<T>(
  method: string,
  path: string,
  apiKey: string,
  apiSecret: string,
  queryParams?: Record<string, string>
): Promise<T | null> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const queryString = queryParams ? "?" + new URLSearchParams(queryParams).toString() : "";
  const fullPath = path + queryString;

  const signature = getCoinbaseSignature(fullPath, method, apiSecret, timestamp);

  const res = await fetch(`${BASE_URL}${fullPath}`, {
    method,
    headers: {
      "CB-ACCESS-KEY": apiKey,
      "CB-ACCESS-SIGN": signature,
      "CB-ACCESS-TIMESTAMP": timestamp,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erreur API Coinbase (${res.status}) : ${text}`);
  }

  return res.json() as Promise<T>;
}

type CoinbaseFill = {
  entry_id: string;
  trade_id: string;
  trade_time: string;
  side: "BUY" | "SELL";
  price: string;
  size: string;
  product_id: string;
  commission: string;
};

type FillsResponse = {
  fills: CoinbaseFill[];
  cursor: string;
};

function toTransaction(fill: CoinbaseFill): Transaction | null {
  if (!fill.product_id) return null;
  const parts = fill.product_id.split("-");
  const baseAsset = parts[0];

  const date = new Date(fill.trade_time);
  const type = fill.side === "BUY" ? "buy" : "sell";
  const priceEur = Number(fill.price);
  const qty = Number(fill.size);
  const fiatAmount = qty * priceEur;

  return {
    id: `coinbase-${fill.trade_id || fill.entry_id}`,
    date,
    platform: "coinbase",
    asset: baseAsset,
    qty,
    priceEur,
    fiatAmount,
    type,
    isTaxable: type === "sell",
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const { apiKey, apiSecret } = body as Record<string, string>;
  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: "apiKey et apiSecret sont requis" }, { status: 400 });
  }

  try {
    const transactions: Transaction[] = [];
    let cursor = "";
    let hasMore = true;

    while (hasMore) {
      const params: Record<string, string> = { limit: "100" };
      if (cursor) params.cursor = cursor;

      const result = await coinbaseFetch<FillsResponse>("GET", "/api/v3/brokerage/orders/historical/fills", apiKey, apiSecret, params);

      if (!result || !result.fills || result.fills.length === 0) break;

      for (const fill of result.fills) {
        const tx = toTransaction(fill);
        if (tx) transactions.push(tx);
      }

      if (result.cursor) {
        cursor = result.cursor;
      } else {
        hasMore = false;
      }
    }

    transactions.sort((a, b) => a.date.getTime() - b.date.getTime());
    return NextResponse.json({ transactions, count: transactions.length });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Erreur lors de la récupération depuis Coinbase" },
      { status: 502 }
    );
  }
}