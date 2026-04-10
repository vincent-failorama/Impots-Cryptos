import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { Transaction } from "@/lib/types";

// En mode Electron, DATA_DIR pointe vers userData (writable).
// En mode Next.js classique, fallback sur data/ à la racine du projet.
const DATA_PATH = path.join(process.env.DATA_DIR ?? path.join(process.cwd(), "data"), "transactions.json");

// Mutex d'écriture : toutes les écritures sont sérialisées via ce verrou.
// Empêche la race condition lecture-modification-écriture en cas de requêtes concurrentes.
let writeLock: Promise<void> = Promise.resolve();

function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeLock.then(fn);
  // La chaîne absorbe les erreurs pour ne pas bloquer les prochains appels
  writeLock = result.then(() => {}, () => {});
  return result;
}

const VALID_PLATFORMS = new Set(["binance", "bitget", "kraken", "gate", "kucoin", "coinbase"]);
const VALID_TYPES = new Set(["buy", "sell", "trade", "staking", "mining", "airdrop", "other"]);

function isValidTransaction(tx: unknown): tx is Transaction {
  if (!tx || typeof tx !== "object") return false;
  const t = tx as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    t.id.length > 0 &&
    (typeof t.date === "string" || t.date instanceof Date) &&
    VALID_PLATFORMS.has(t.platform as string) &&
    typeof t.asset === "string" &&
    typeof t.qty === "number" &&
    Number.isFinite(t.qty) &&
    typeof t.priceEur === "number" &&
    typeof t.fiatAmount === "number" &&
    VALID_TYPES.has(t.type as string) &&
    typeof t.isTaxable === "boolean"
  );
}

async function readTransactions(): Promise<Transaction[]> {
  try {
    const text = await fs.readFile(DATA_PATH, "utf-8");
    const parsed = JSON.parse(text) as Array<Omit<Transaction, "date"> & { date: string }>;
    return parsed.map((tx) => ({ ...tx, date: new Date(tx.date) }));
  } catch {
    return [];
  }
}

export async function GET() {
  const transactions = await readTransactions();
  return NextResponse.json(transactions);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  if (!Array.isArray(body)) {
    return NextResponse.json({ error: "Un tableau de transactions est attendu" }, { status: 400 });
  }

  const invalid = body.filter((tx) => !isValidTransaction(tx));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `${invalid.length} transaction(s) invalide(s) rejetée(s)` },
      { status: 400 }
    );
  }

  const incoming = body as Transaction[];

  return withWriteLock(async () => {
    const existing = await readTransactions();
    const existingIds = new Set(existing.map((tx) => tx.id));
    const newTx = incoming.filter((tx) => !existingIds.has(tx.id));

    if (newTx.length === 0) {
      return NextResponse.json({ saved: 0, duplicates: incoming.length });
    }

    const merged = [...existing, ...newTx];
    await fs.writeFile(DATA_PATH, JSON.stringify(merged, null, 2), "utf-8");
    return NextResponse.json({ saved: newTx.length, duplicates: incoming.length - newTx.length });
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  return withWriteLock(async () => {
    if (id) {
      const transactions = await readTransactions();
      const filtered = transactions.filter((tx) => tx.id !== id);
      await fs.writeFile(DATA_PATH, JSON.stringify(filtered, null, 2), "utf-8");
      return NextResponse.json({ deleted: transactions.length - filtered.length });
    }

    await fs.writeFile(DATA_PATH, "[]", "utf-8");
    return NextResponse.json({ cleared: true });
  });
}
