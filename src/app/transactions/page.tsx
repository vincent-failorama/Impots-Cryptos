'use client';

import { useEffect, useState } from 'react';
import { CessionResult, calculateCessions, computeTotalGain, computeTotalTaxable } from '@/lib/calculator';
import { Transaction } from '@/lib/types';
import Link from 'next/link';

const TABLE_HEADERS = [
  { label: 'Date', align: 'left', className: 'text-slate-900' },
  { label: 'Plateforme', align: 'left', className: 'text-slate-900' },
  { label: 'Actif', align: 'left', className: 'text-slate-900' },
  { label: 'Qté', align: 'right', className: 'text-slate-900' },
  { label: 'Produit', align: 'right', className: 'text-slate-900' },
  { label: 'Coût imputé', align: 'right', className: 'text-slate-900' },
  { label: 'Gain / Perte', align: 'right', className: 'text-slate-900' },
  { label: 'Val. portefeuille ⓘ', align: 'right', className: 'text-slate-500', title: 'Valeur globale estimée du portefeuille au moment de la cession (art. 150 VH bis)' },
  { label: 'Actions', align: 'center', className: 'text-slate-900' },
];

export default function TransactionsPage() {
  const [cessions, setCessions] = useState<CessionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [progressMsg, setProgressMsg] = useState('');
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [filterAsset, setFilterAsset] = useState<string>('all');

  const fetchTransactions = (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    fetch('/api/transactions', { signal })
      .then((res) => res.json())
      .then(async (data: Array<Omit<Transaction, 'date'> & { date: string }>) => {
        const transactions: Transaction[] = data.map((tx) => ({ ...tx, date: new Date(tx.date) }));
        const cgApiKey = localStorage.getItem('crypto-tax-coingecko') ?? undefined;
        setCessions(await calculateCessions(transactions, setProgressMsg, cgApiKey));
      })
      .catch((err) => { if (err.name !== 'AbortError') setError('Impossible de charger les transactions.'); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchTransactions(controller.signal);
    return () => controller.abort();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Voulez-vous vraiment supprimer cette transaction ? L'historique des plus-values sera recalculé.")) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/transactions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erreur API');
      fetchTransactions();
    } catch (err) {
      setError('Impossible de supprimer la transaction.');
      setLoading(false);
    }
  };

  const uniquePlatforms = Array.from(new Set(cessions.map(c => c.platform))).sort();
  const uniqueAssets = Array.from(new Set(cessions.map(c => c.asset))).sort();

  const filteredCessions = cessions.filter(c => {
    if (filterPlatform !== 'all' && c.platform !== filterPlatform) return false;
    if (filterAsset !== 'all' && c.asset !== filterAsset) return false;
    return true;
  });

  const groupedCessions = filteredCessions.reduce((acc, cession) => {
    const year = cession.date.getFullYear();
    if (!acc[year]) acc[year] = [];
    acc[year].push(cession);
    return acc;
  }, {} as Record<number, CessionResult[]>);

  const years = Object.keys(groupedCessions)
    .map(Number)
    .sort((a, b) => b - a); // Tri décroissant (ex: 2024, 2023...)

  const exportCsv = () => {
    const headers = ['Date', 'Plateforme', 'Actif', 'Quantité', 'Produit (EUR)', 'Coût imputé (EUR)', 'Gain/Perte (EUR)', 'Valeur Portefeuille (EUR)'];
    const rows = filteredCessions.map(c => [
      new Date(c.date).toLocaleDateString('fr-FR'),
      c.platform,
      c.asset,
      c.qty.toString().replace('.', ','),
      c.grossProceeds.toFixed(2).replace('.', ','),
      c.acquisitionCost.toFixed(2).replace('.', ','),
      c.gainLoss.toFixed(2).replace('.', ','),
      c.portfolioValueAtSale.toFixed(2).replace('.', ',')
    ]);
    const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'cessions_imposables.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-slate-900">Cessions imposables</h1>
              <p className="mt-2 text-slate-600 text-sm">
                Calcul selon la méthode proportionnelle de l&apos;article 150 VH bis du CGI.
                La colonne <em>Valeur portefeuille</em> est estimée d&apos;après les derniers prix connus dans vos transactions.
              </p>
            </div>
            {cessions.length > 0 && (
              <button
                onClick={exportCsv}
                className="shrink-0 rounded-xl bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-700 hover:bg-teal-100 transition"
              >
                ↓ Exporter en CSV
              </button>
            )}
          </div>

          {cessions.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-6 border-t border-slate-100 pt-6">
              <label className="flex items-center gap-3 text-sm text-slate-700">
                <span className="font-medium">Plateforme :</span>
                <select
                  value={filterPlatform}
                  onChange={e => setFilterPlatform(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 capitalize"
                >
                  <option value="all">Toutes</option>
                  {uniquePlatforms.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>

              <label className="flex items-center gap-3 text-sm text-slate-700">
                <span className="font-medium">Actif :</span>
                <select
                  value={filterAsset}
                  onChange={e => setFilterAsset(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                >
                  <option value="all">Tous</option>
                  {uniqueAssets.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
            </div>
          )}
        </section>

        {loading ? (
          <section className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-200 text-slate-500">
            <p>Calcul des cessions en cours…</p>
            {progressMsg && <p className="mt-2 text-sm text-teal-600 animate-pulse">{progressMsg}</p>}
          </section>
        ) : error ? (
          <section className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-200">
            <p className="text-red-600">{error}</p>
          </section>
        ) : cessions.length === 0 ? (
          <section className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-200 text-slate-500">
            <p>Aucune cession imposable.</p>
            <Link href="/import" className="mt-2 block text-sm text-teal-600 underline">
              Importer des transactions CSV →
            </Link>
          </section>
        ) : filteredCessions.length === 0 ? (
          <section className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-200 text-slate-500">
            <p>Aucune transaction ne correspond à vos filtres.</p>
            <button onClick={() => { setFilterPlatform('all'); setFilterAsset('all'); }} className="mt-2 block text-sm text-teal-600 underline">
              Réinitialiser les filtres
            </button>
          </section>
        ) : (
          years.map((year) => {
            const yearCessions = groupedCessions[year];
            const yearGain = computeTotalGain(yearCessions);
            const yearTaxable = computeTotalTaxable(yearCessions);

            return (
              <section key={year} className="overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-slate-200">
                <div className="border-b border-slate-200 bg-slate-50/50 p-8">
                  <h2 className="mb-6 text-2xl font-bold text-slate-900">Année fiscale {year}</h2>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                      <p className="text-sm text-slate-500">Plus-value nette</p>
                      <p className={`mt-3 text-3xl font-semibold ${yearGain >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {yearGain.toFixed(2)} €
                      </p>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                      <p className="text-sm text-slate-500">Total cessions imposables</p>
                      <p className="mt-3 text-3xl font-semibold text-slate-900">{yearTaxable.toFixed(2)} €</p>
                    </div>
                    <div className="rounded-3xl border border-amber-100 bg-amber-50 p-6 shadow-sm">
                      <p className="text-sm text-amber-700">Reporter case 3AN / 3BN</p>
                      <p className="mt-3 text-sm text-amber-800">
                        {yearGain >= 0
                          ? `3AN = ${yearGain.toFixed(2)} €`
                          : `3BN = ${Math.abs(yearGain).toFixed(2)} € (non reportable)`}
                      </p>
                      <Link href="/cerfa" className="mt-2 block text-xs text-teal-600 underline">
                        Générer le Cerfa →
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        {TABLE_HEADERS.map((h, i) => (
                          <th key={i} className={`px-4 py-4 font-semibold ${h.className} text-${h.align}`} title={h.title}>
                            {h.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {yearCessions.map((cession) => (
                        <tr key={cession.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                            {new Date(cession.date).toLocaleDateString('fr-FR')}
                          </td>
                          <td className="px-4 py-3 text-slate-700 capitalize">{cession.platform}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">{cession.asset}</td>
                          <td className="px-4 py-3 text-slate-700 text-right">{cession.qty}</td>
                          <td className="px-4 py-3 text-slate-700 text-right">{cession.grossProceeds.toFixed(2)} €</td>
                          <td className="px-4 py-3 text-slate-700 text-right">{cession.acquisitionCost.toFixed(2)} €</td>
                          <td className={`px-4 py-3 text-right font-semibold ${cession.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {cession.gainLoss >= 0 ? '+' : ''}{cession.gainLoss.toFixed(2)} €
                          </td>
                          <td className="px-4 py-3 text-right text-xs">
                            <span className={cession.portfolioValueCertain ? 'text-slate-400' : 'text-amber-600'}>
                              {cession.portfolioValueAtSale.toFixed(0)} €
                            </span>
                            {!cession.portfolioValueCertain && (
                              <span
                                title="Valeur estimée : au moins un actif n'a pas pu être évalué via CoinGecko. La plus-value calculée peut être surévaluée."
                                className="ml-1 cursor-help"
                              >
                                ⚠️
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleDelete(cession.id)}
                              className="text-xs font-medium text-red-500 hover:text-red-700 hover:underline"
                            >
                              Supprimer
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}
