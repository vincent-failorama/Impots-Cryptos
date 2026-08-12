import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { Transaction, isTransactionType } from "@/lib/types";
import { isPlatformId } from "@/lib/platforms";

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

function isValidTransaction(tx: unknown): tx is Transaction {
  if (!tx || typeof tx !== "object") return false;
  const t = tx as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    t.id.length > 0 &&
    (typeof t.date === "string" || t.date instanceof Date) &&
    isPlatformId(t.platform) &&
    typeof t.asset === "string" &&
    typeof t.qty === "number" &&
    Number.isFinite(t.qty) &&
    typeof t.priceEur === "number" &&
    typeof t.fiatAmount === "number" &&
    isTransactionType(t.type) &&
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

/**
 * Modifie une transaction existante, ou remplace l'intégralité du jeu de
 * données lorsque le corps est un tableau (restauration d'une sauvegarde).
 *
 * L'application ne savait jusqu'ici qu'importer et supprimer : une ligne mal
 * lue par un parser, une opération de gré à gré ou une plateforme non
 * supportée laissaient l'utilisateur sans recours.
 */
export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  // ── Restauration complète ────────────────────────────────────────────────
  if (Array.isArray(body)) {
    const invalid = body.filter((tx) => !isValidTransaction(tx));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `${invalid.length} transaction(s) invalide(s) : restauration annulée` },
        { status: 400 }
      );
    }
    return withWriteLock(async () => {
      await fs.writeFile(DATA_PATH, JSON.stringify(body, null, 2), "utf-8");
      return NextResponse.json({ restored: body.length });
    });
  }

  // ── Modification d'une transaction ───────────────────────────────────────
  if (!isValidTransaction(body)) {
    return NextResponse.json({ error: "Transaction invalide" }, { status: 400 });
  }
  const updated = body as Transaction;

  return withWriteLock(async () => {
    const existing = await readTransactions();
    const index = existing.findIndex((tx) => tx.id === updated.id);
    if (index === -1) {
      return NextResponse.json({ error: "Transaction introuvable" }, { status: 404 });
    }
    existing[index] = updated;
    await fs.writeFile(DATA_PATH, JSON.stringify(existing, null, 2), "utf-8");
    return NextResponse.json({ updated: 1 });
  });
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
