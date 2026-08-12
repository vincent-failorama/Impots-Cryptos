import { NextResponse } from "next/server";
import crypto from "crypto";
import { Transaction } from "@/lib/types";
import { API_QUOTE_ASSETS } from "@/lib/quote-currencies";
import { BROKER_PAUSE_MS, sleep } from "@/lib/rate-limits";
import { CG_ASSET_MAP } from "@/lib/pricer";

const BASE = "https://api.gateio.ws";
const PREFIX = "/api/v4";

const QUOTE_ASSETS = API_QUOTE_ASSETS;

/**
 * Signature Gate.io API v4.
 * SIGN = HMAC-SHA512( secret, "METHOD\nPATH\nQUERY\nSHA512(body)\ntimestamp" )
 */
function sign(
  method: string,
  path: string,
  query: string,
  body: string,
  secret: string,
  timestamp: string
): string {
  const hashedBody = crypto.createHash("sha512").update(body).digest("hex");
  const payload = `${method}\n${path}\n${query}\n${hashedBody}\n${timestamp}`;
  return crypto.createHmac("sha512", secret).update(payload).digest("hex");
}

async function gateGet<T>(
  path: string,
  params: Record<string, string>,
  apiKey: string,
  apiSecret: string
): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const fullPath = PREFIX + path;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = sign("GET", fullPath, query, "", apiSecret, timestamp);

  const res = await fetch(`${BASE}${fullPath}${query ? `?${query}` : ""}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      KEY: apiKey,
      Timestamp: timestamp,
      SIGN: signature,
    },
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { label?: string; message?: string };
    throw new Error(err.message || err.label || `Erreur API Gate.io (${res.status})`);
  }

  return res.json() as Promise<T>;
}

type GateAccount = { currency: string; available: string; locked: string };

type GateTrade = {
  id: string;
  create_time: string;
  currency_pair: string;
  side: "buy" | "sell";
  amount: string;
  price: string;
};

function buildTransaction(trade: GateTrade, base: string, quote: string): Transaction {
  const qty = Number(trade.amount);
  const price = Number(trade.price);
  const total = qty * price;
  const date = new Date(Number(trade.create_time) * 1000);
  const id = `gate-${trade.id}-${trade.currency_pair}`;

  // Cotation en EUR → cession/acquisition directement valorisée en euros.
  if (quote === "EUR") {
    const type = trade.side === "buy" ? "buy" : "sell";
    return {
      id,
      date,
      platform: "gate",
      asset: base,
      qty,
      priceEur: price,
      fiatAmount: total,
      type,
      isTaxable: type === "sell",
    };
  }

  // Crypto→crypto : sursis d'imposition (art. 150 VH bis, II-A CGI).
  // On enregistre quand même le mouvement pour que les holdings restent justes.
  if (trade.side === "buy") {
    // Achat de `base` payé en `quote` → sortie de `quote`, entrée de `base`
    return {
      id,
      date,
      platform: "gate",
      asset: quote,
      qty: total,
      priceEur: 0,
      fiatAmount: 0,
      type: "trade",
      isTaxable: false,
      receivedAsset: base,
      receivedQty: qty,
    };
  }

  // Vente de `base` contre `quote` → sortie de `base`, entrée de `quote`
  return {
    id,
    date,
    platform: "gate",
    asset: base,
    qty,
    priceEur: 0,
    fiatAmount: 0,
    type: "trade",
    isTaxable: false,
    receivedAsset: quote,
    receivedQty: total,
  };
}

/**
 * Récupère l'historique des trades spot Gate.io.
 *
 * Gate.io impose un `currency_pair` par requête. Pour éviter de balayer les
 * milliers de paires du marché, on part des devises effectivement présentes sur
 * le compte (`/spot/accounts`) et on ne teste que leurs combinaisons avec les
 * grandes devises de cotation.
 */
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
    // 1. Devises détenues sur le compte
    const accounts = await gateGet<GateAccount[]>("/spot/accounts", {}, apiKey, apiSecret);
    const currencies = new Set(
      accounts
        .filter((a) => Number(a.available) > 0 || Number(a.locked) > 0)
        .map((a) => a.currency.toUpperCase())
    );

    // Toujours inclure les actifs majeurs : un actif entièrement revendu affiche
    // un solde nul mais possède néanmoins un historique de trades à déclarer.
    for (const major of Object.keys(CG_ASSET_MAP)) {
      currencies.add(major);
    }

    // 2. Construction des paires candidates
    const pairs: Array<{ pair: string; base: string; quote: string }> = [];
    for (const base of currencies) {
      for (const quote of QUOTE_ASSETS) {
        if (base === quote) continue;
        pairs.push({ pair: `${base}_${quote}`, base, quote });
      }
    }

    const transactions: Transaction[] = [];
    const errors: string[] = [];
    let symbolsQueried = 0;

    for (const { pair, base, quote } of pairs) {
      try {
        // Pagination : 1000 max par page côté Gate.io
        for (let page = 1; page <= 10; page++) {
          const trades = await gateGet<GateTrade[]>(
            "/spot/my_trades",
            { currency_pair: pair, limit: "1000", page: String(page) },
            apiKey,
            apiSecret
          );
          if (!Array.isArray(trades) || trades.length === 0) break;

          for (const trade of trades) {
            transactions.push(buildTransaction(trade, base, quote));
          }
          if (trades.length < 1000) break;
        }
        symbolsQueried++;
        await sleep(BROKER_PAUSE_MS.gate);
      } catch (err) {
        // Paire inexistante ou non tradée sur ce compte → on ignore
        symbolsQueried++;
        const msg = err instanceof Error ? err.message : String(err);
        // On ne remonte que les erreurs d'authentification, pas les paires absentes
        if (/key|sign|permission|auth/i.test(msg) && errors.length < 5) {
          errors.push(`${pair} : ${msg}`);
        }
      }
    }

    // Dédoublonnage (une même paire peut être atteinte par deux chemins)
    const unique = new Map(transactions.map((t) => [t.id, t]));
    const result = Array.from(unique.values()).sort((a, b) => a.date.getTime() - b.date.getTime());

    return NextResponse.json({
      transactions: result,
      count: result.length,
      symbolsQueried,
      errors,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur lors de la récupération depuis Gate.io" },
      { status: 502 }
    );
  }
}
