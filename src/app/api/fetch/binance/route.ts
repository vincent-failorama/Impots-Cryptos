import { NextResponse } from "next/server";
import crypto from "crypto";
import { Transaction } from "@/lib/types";

const BASE = "https://api.binance.com";

// Actifs cotés à interroger (paires majeures)
const QUOTE_ASSETS = new Set(["EUR", "USDT", "USDC", "BTC", "ETH", "BNB"]);

function sign(queryString: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

async function binanceGet<T>(
  path: string,
  params: Record<string, string>,
  apiKey: string,
  apiSecret: string
): Promise<T> {
  const query = new URLSearchParams({ ...params, timestamp: Date.now().toString() });
  const signature = sign(query.toString(), apiSecret);
  query.set("signature", signature);

  const res = await fetch(`${BASE}${path}?${query.toString()}`, {
    headers: { "X-MBX-APIKEY": apiKey },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { msg?: string };
    throw new Error(err.msg || `Erreur API Binance (${res.status})`);
  }

  return res.json();
}

type BinanceSymbolInfo = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
};

type BinanceTrade = {
  id: number;
  symbol: string;
  price: string;
  qty: string;
  quoteQty: string;
  isBuyer: boolean;
  time: number;
};

function buildTransaction(trade: BinanceTrade, symbolInfo: BinanceSymbolInfo): Transaction {
  const { baseAsset, quoteAsset } = symbolInfo;
  const qty = Number(trade.qty);
  const quoteQty = Number(trade.quoteQty);
  const price = Number(trade.price);
  const isEurQuote = quoteAsset === "EUR";

  if (isEurQuote) {
    const type = trade.isBuyer ? "buy" : "sell";
    return {
      id: `binance-${trade.id}-${symbolInfo.symbol}`,
      date: new Date(trade.time),
      platform: "binance",
      asset: baseAsset,
      qty,
      priceEur: price,
      fiatAmount: quoteQty,
      type,
      isTaxable: type === "sell",
    };
  }

  // Crypto→crypto : cession de l'actif envoyé, acquisition de l'actif reçu
  if (trade.isBuyer) {
    // Achat de baseAsset en payant avec quoteAsset → cession de quoteAsset
    return {
      id: `binance-${trade.id}-${symbolInfo.symbol}`,
      date: new Date(trade.time),
      platform: "binance",
      asset: quoteAsset,
      qty: quoteQty,
      priceEur: 0,
      fiatAmount: 0,
      type: "trade",
      isTaxable: true,
      receivedAsset: baseAsset,
      receivedQty: qty,
    };
  } else {
    // Vente de baseAsset contre quoteAsset → cession de baseAsset
    return {
      id: `binance-${trade.id}-${symbolInfo.symbol}`,
      date: new Date(trade.time),
      platform: "binance",
      asset: baseAsset,
      qty,
      priceEur: 0,
      fiatAmount: 0,
      type: "trade",
      isTaxable: true,
      receivedAsset: quoteAsset,
      receivedQty: quoteQty,
    };
  }
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
    // Récupérer la liste des symboles disponibles
    const exchangeInfo = await fetch(`${BASE}/api/v3/exchangeInfo`).then((r) => r.json()) as { symbols: BinanceSymbolInfo[] };
    const symbols = exchangeInfo.symbols.filter(
      (s) => s.status === "TRADING" && QUOTE_ASSETS.has(s.quoteAsset)
    );

    const transactions: Transaction[] = [];
    const errors: string[] = [];
    let symbolsQueried = 0;

    for (const symbolInfo of symbols) {
      try {
        const trades = await binanceGet<BinanceTrade[]>(
          "/api/v3/myTrades",
          { symbol: symbolInfo.symbol, limit: "1000" },
          apiKey,
          apiSecret
        );

        symbolsQueried++;

        for (const trade of trades) {
          transactions.push(buildTransaction(trade, symbolInfo));
        }

        // Respecter le rate limit Binance (1200 req/min sur l'IP, 10 points/s sur l'API key)
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch {
        // Symbole non tradé sur ce compte — on ignore silencieusement
        symbolsQueried++;
      }
    }

    transactions.sort((a, b) => a.date.getTime() - b.date.getTime());
    return NextResponse.json({ transactions, count: transactions.length, symbolsQueried, errors });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Erreur lors de la récupération depuis Binance" },
      { status: 502 }
    );
  }
}
