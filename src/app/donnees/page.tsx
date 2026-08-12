'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getPlatform } from '@/lib/platforms';
import type { Transaction } from '@/lib/types';
import { TransactionForm, type EditableTransaction } from './transaction-form';

type Stored = Omit<Transaction, 'date'> & { date: string };

const TYPE_BADGE: Record<string, string> = {
  buy: 'bg-slate-100 text-slate-700',
  sell: 'bg-amber-100 text-amber-800',
  trade: 'bg-slate-100 text-slate-600',
  staking: 'bg-teal-100 text-teal-800',
  mining: 'bg-teal-100 text-teal-800',
  airdrop: 'bg-teal-100 text-teal-800',
  other: 'bg-slate-100 text-slate-500',
};

export default function DonneesPage() {
  const [transactions, setTransactions] = useState<Stored[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<EditableTransaction | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/transactions');
      if (!res.ok) throw new Error('Réponse invalide du serveur');
      setTransactions(await res.json());
    } catch {
      setError('Impossible de charger vos transactions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 4000);
  };

  const handleSave = async (tx: EditableTransaction) => {
    setBusy(true);
    setError('');
    try {
      const isEdit = transactions.some((t) => t.id === tx.id);
      const res = await fetch('/api/transactions', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? tx : [tx]),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erreur inconnue' }));
        throw new Error(err.error ?? 'Enregistrement refusé');
      }
      flash(isEdit ? 'Transaction modifiée.' : 'Transaction ajoutée.');
      setEditing(null);
      setAdding(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer définitivement cette transaction ?')) return;
    setBusy(true);
    try {
      await fetch(`/api/transactions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      flash('Transaction supprimée.');
      await load();
    } catch {
      setError('Suppression impossible.');
    } finally {
      setBusy(false);
    }
  };

  // ── Sauvegarde et restauration ────────────────────────────────────────────

  const handleBackup = () => {
    const blob = new Blob([JSON.stringify(transactions, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `crypto-tax-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleRestore = async (file: File) => {
    if (!confirm(
      'La restauration remplace TOUTES vos transactions actuelles par le contenu du fichier. Continuer ?'
    )) return;

    setBusy(true);
    setError('');
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) throw new Error('Le fichier ne contient pas une liste de transactions.');

      const res = await fetch('/api/transactions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erreur inconnue' }));
        throw new Error(err.error ?? 'Restauration refusée');
      }
      const { restored } = await res.json();
      flash(`${restored} transaction(s) restaurée(s).`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fichier de sauvegarde illisible.');
    } finally {
      setBusy(false);
    }
  };

  const sorted = [...transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <main className="px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-6">

        <section className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Mes données</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                Les transactions brutes telles qu&apos;elles sont enregistrées. Corrigez une ligne
                mal interprétée à l&apos;import, ajoutez une opération de gré à gré ou une
                plateforme non supportée, et sauvegardez l&apos;ensemble.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setAdding(true); setEditing(null); }}
                disabled={busy}
                className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50"
              >
                + Ajouter
              </button>
              <button
                onClick={handleBackup}
                disabled={transactions.length === 0}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 disabled:opacity-50"
              >
                ↓ Sauvegarder
              </button>
              <label className="cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-400">
                ↑ Restaurer
                <input
                  type="file" accept=".json" className="sr-only" disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleRestore(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>

          {message && (
            <p className="mt-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          {(adding || editing) && (
            <div className="mt-6">
              <TransactionForm
                initial={editing ?? undefined}
                onSubmit={handleSave}
                onCancel={() => { setAdding(false); setEditing(null); }}
                busy={busy}
              />
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          {loading ? (
            <p className="p-8 text-sm text-slate-500">Chargement…</p>
          ) : sorted.length === 0 ? (
            <div className="p-8 text-sm text-slate-500">
              <p>Aucune transaction enregistrée.</p>
              <Link href="/import" className="mt-2 inline-block text-teal-600 underline">
                Importer un fichier CSV
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {['Date', 'Plateforme', 'Actif', 'Type', 'Qté', 'Montant', 'Frais', 'Actions'].map((h) => (
                      <th key={h} scope="col" className={`px-4 py-3 font-semibold text-slate-900 ${
                        ['Qté', 'Montant', 'Frais'].includes(h) ? 'text-right'
                          : h === 'Actions' ? 'text-center' : 'text-left'
                      }`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sorted.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {new Date(tx.date).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{getPlatform(tx.platform).label}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{tx.asset}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[tx.type] ?? TYPE_BADGE.other}`}>
                          {tx.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">{tx.qty}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{tx.fiatAmount.toFixed(2)} €</td>
                      <td className="px-4 py-3 text-right text-slate-500">
                        {tx.feeEur !== undefined ? `${tx.feeEur.toFixed(2)} €` : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center">
                        <button
                          onClick={() => { setEditing({ ...tx }); setAdding(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                          className="text-xs font-medium text-teal-600 hover:underline"
                        >
                          Modifier
                        </button>
                        <span className="mx-2 text-slate-300">·</span>
                        <button
                          onClick={() => handleDelete(tx.id)}
                          className="text-xs font-medium text-red-500 hover:underline"
                        >
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="px-2 text-xs leading-relaxed text-slate-500">
          Une sauvegarde est un simple fichier JSON conservé sur votre machine. Pensez à en
          produire une avant toute manipulation importante : la restauration remplace
          l&apos;intégralité des transactions enregistrées.
        </p>
      </div>
    </main>
  );
}
