import { NextResponse } from "next/server";
import crypto from "crypto";
import { Transaction } from "@/lib/types";

const BASE = "https://api.kraken.com";

function getKrakenSignature(path: string, params: Record<string, string>, secret: string, nonce: string) {
  const postData = new URLSearchParams(params).toString();
  const secretBuffer = Buffer.from(secret, "base64");
  const hash = crypto.createHash("sha256");
  hash.update(nonce + postData);
  const hashDigest = hash.digest();

  const hmac = crypto.createHmac("sha512", secretBuffer);
  hmac.update(Buffer.from(path));
  hmac.update(hashDigest);
  return hmac.digest("base64");
}

async function krakenPost<T>(
  path: string,
  params: Record<string, string>,
  apiKey: string,
  apiSecret: string
): Promise<T | null> {
  const nonce = (Date.now() * 1000).toString();
  const payload = { nonce, ...params };
  const signature = getKrakenSignature(path, payload, apiSecret, nonce);

  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "API-Key": apiKey,
      "API-Sign": signature,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(payload).toString(),
  });

  if (!res.ok) return null;
  const json = await res.json();
  if (json.error && json.error.length > 0) {
    throw new Error(`Erreur API Kraken: ${json.error.join(", ")}`);
  }
  return json.result as T;
}

type KrakenTrade = {
  time: number;
  pair: string;
  type: "buy" | "sell";
  price: string;
  cost: string;
  vol: string;
};

type TradesHistoryResult = {
  trades: Record<string, KrakenTrade>;
  count: number;
};

function parseKrakenPair(pair: string) {
  let base = pair;
  if (pair.endsWith("EUR")) base = pair.slice(0, -3);
  else if (pair.endsWith("USD")) base = pair.slice(0, -3);
  else if (pair.endsWith("USDT")) base = pair.slice(0, -4);
  else if (pair.endsWith("USDC")) base = pair.slice(0, -4);

  // Kraken utilise parfois des préfixes hérités comme XBT pour le Bitcoin, etc.
  if (base.endsWith("Z")) base = base.slice(0, -1);
  if (base.startsWith("X") && base.length >= 4) base = base.slice(1);

  if (base === "XBT") return "BTC";
  if (base === "XDG") return "DOGE";
  return base;
}

function toTransaction(id: string, trade: KrakenTrade): Transaction {
  const date = new Date(trade.time * 1000);
  const type = trade.type === "buy" ? "buy" : "sell";
  const baseAsset = parseKrakenPair(trade.pair);

  return {
    id: `kraken-${id}`,
    date,
    platform: "kraken",
    asset: baseAsset,
    qty: Number(trade.vol),
    priceEur: Number(trade.price),
    fiatAmount: Number(trade.cost),
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
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const result = await krakenPost<TradesHistoryResult>(
        "/0/private/TradesHistory",
        { ofs: offset.toString() },
        apiKey,
        apiSecret
      );

      if (!result || !result.trades) break;

      const tradeIds = Object.keys(result.trades);
      if (tradeIds.length === 0) break;

      for (const id of tradeIds) {
        transactions.push(toTransaction(id, result.trades[id]));
      }

      offset += tradeIds.length;
      if (offset >= result.count) {
        hasMore = false;
      }
    }

    transactions.sort((a, b) => a.date.getTime() - b.date.getTime());
    return NextResponse.json({ transactions, count: transactions.length });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Erreur lors de la récupération depuis Kraken" },
      { status: 502 }
    );
  }
}
