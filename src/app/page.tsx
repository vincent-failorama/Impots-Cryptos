'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { CessionResult, calculateCessions, computeTotalGain } from "@/lib/calculator";
import { Transaction } from "@/lib/types";

const QUICK_LINKS = [
  { href: '/import', label: 'Importer CSV', primary: true },
  { href: '/transactions', label: 'Transactions' },
  { href: '/cerfa', label: 'Cerfa 2086 / 3916-bis' },
];

const FEATURES_LIST = [
  "Analyse de transactions crypto par plateforme (Binance, Bitget, Kraken, Gate.io)",
  "Calcul de plus-values / moins-values avec la formule 150 VH bis",
  "Récupération de prix historiques via l'API CoinGecko",
  "Génération de Cerfa 2086 et 3916-bis en PDF",
];

export default function Home() {
  const [chartData, setChartData] = useState<{ year: number; gain: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/transactions', { signal: controller.signal })
      .then((res) => res.json())
      .then(async (data: Array<Omit<Transaction, 'date'> & { date: string }>) => {
        if (!data || data.length === 0) return;

        const transactions: Transaction[] = data.map((tx) => ({ ...tx, date: new Date(tx.date) }));
        const cgApiKey = localStorage.getItem('crypto-tax-coingecko') ?? undefined;
        const cessions = await calculateCessions(transactions, undefined, cgApiKey);

        const grouped = cessions.reduce((acc, cession) => {
          const year = cession.date.getFullYear();
          if (!acc[year]) acc[year] = [];
          acc[year].push(cession);
          return acc;
        }, {} as Record<number, CessionResult[]>);

        const yearsData = Object.keys(grouped)
          .map(Number)
          .sort((a, b) => a - b) // Ordre chronologique
          .map(year => ({ year, gain: computeTotalGain(grouped[year]) }));

        setChartData(yearsData);
      })
      .catch((err) => { if (err.name !== 'AbortError') {} })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const maxAbsVal = chartData.length > 0 ? Math.max(...chartData.map(d => Math.abs(d.gain)), 1) : 1;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-10">
        <section className="rounded-3xl bg-white p-10 shadow-lg ring-1 ring-slate-200">
          <h1 className="text-4xl font-semibold text-slate-950">crypto-tax-fr</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
            Calculateur d&apos;impôt crypto français (article 150 VH bis CGI). Importez vos rapports CSV, visualisez
            vos cessions imposables et préparez votre Cerfa 2086 / 3916-bis.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {QUICK_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-3xl px-6 py-5 text-center text-sm font-semibold transition ${
                  link.primary
                    ? 'bg-teal-600 text-white shadow-sm hover:bg-teal-700'
                    : 'border border-slate-200 bg-white text-slate-900 hover:border-slate-300'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </section>

        {/* Section Graphique */}
        <section className="rounded-3xl bg-white p-10 shadow-lg ring-1 ring-slate-200">
          <h2 className="text-2xl font-semibold text-slate-900 mb-8">Évolution des plus-values</h2>
          
          {loading ? (
            <div className="h-64 flex items-center justify-center text-slate-500 animate-pulse">
              Calcul de l&apos;historique en cours...
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-500 space-y-3">
              <p>Aucune donnée à afficher pour le moment.</p>
              <Link href="/import" className="text-sm font-medium text-teal-600 hover:underline">
                Importer vos transactions →
              </Link>
            </div>
          ) : (
            <div className="relative h-72 w-full flex items-end pt-8 pb-6">
              {/* Ligne Zéro */}
              <div className="absolute w-full border-t-2 border-slate-200 border-dashed" style={{ bottom: '50%' }}></div>

              {chartData.map(d => {
                // On limite la hauteur max à 45% pour ne pas déborder en haut/bas du conteneur
                const heightPct = (Math.abs(d.gain) / maxAbsVal) * 45;
                const isPositive = d.gain >= 0;

                return (
                  <div key={d.year} className="flex-1 flex flex-col items-center relative h-full group">
                    {isPositive ? (
                      <div className="absolute bottom-1/2 w-3/4 max-w-16 bg-teal-500 rounded-t-md transition-all duration-300 group-hover:bg-teal-400" style={{ height: `${heightPct}%` }}>
                        <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-xs font-bold text-teal-700 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity bg-teal-50 px-2 py-1 rounded-lg border border-teal-100 shadow-sm z-10">
                          +{d.gain.toFixed(0)} €
                        </span>
                      </div>
                    ) : (
                      <div className="absolute top-1/2 w-3/4 max-w-16 bg-red-500 rounded-b-md transition-all duration-300 group-hover:bg-red-400" style={{ height: `${heightPct}%` }}>
                        <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-xs font-bold text-red-700 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity bg-red-50 px-2 py-1 rounded-lg border border-red-100 shadow-sm z-10">
                          {d.gain.toFixed(0)} €
                        </span>
                      </div>
                    )}
                    <span className="absolute bottom-0 text-sm font-medium text-slate-500 bg-white px-2">{d.year}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-white p-10 shadow-lg ring-1 ring-slate-200">
          <h2 className="text-2xl font-semibold text-slate-900">Fonctionnalités incluses</h2>
          <ul className="mt-5 space-y-3 text-slate-700">
            {FEATURES_LIST.map((feature, i) => (
              <li key={i}>• {feature}</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
