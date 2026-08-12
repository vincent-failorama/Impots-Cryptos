import { NextResponse } from "next/server";
import { Transaction } from "@/lib/types";
import { buildCoinbaseJwt } from "@/lib/coinbase-jwt";

const HOST = "api.coinbase.com";
const BASE_URL = `https://${HOST}`;

async function coinbaseFetch<T>(
  method: string,
  path: string,
  apiKey: string,
  apiSecret: string,
  queryParams?: Record<string, string>
): Promise<T | null> {
  const queryString = queryParams ? "?" + new URLSearchParams(queryParams).toString() : "";
  const fullPath = path + queryString;

  // Le JWT porte le chemin sans la chaîne de requête et n'est valable que 120 s :
  // il est donc régénéré à chaque appel, y compris entre deux pages de résultats.
  const jwt = buildCoinbaseJwt(apiKey, apiSecret, method, HOST, path);

  const res = await fetch(`${BASE_URL}${fullPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) {
      throw new Error(
        "Authentification Coinbase refusée (401). Les clés API « legacy » ont expiré le " +
        "5 février 2025 : créez une clé sur Coinbase Developer Platform et utilisez le nom " +
        "complet de la clé (organizations/…/apiKeys/…) ainsi que son secret."
      );
    }
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

  // Échec immédiat et explicite si le secret n'est pas exploitable, plutôt
  // qu'un 401 opaque renvoyé par Coinbase après un aller-retour réseau.
  try {
    buildCoinbaseJwt(apiKey, apiSecret, "GET", HOST, "/api/v3/brokerage/accounts");
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Clé secrète Coinbase invalide." },
      { status: 400 }
    );
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
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur lors de la récupération depuis Coinbase" },
      { status: 502 }
    );
  }
}