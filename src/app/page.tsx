'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { CessionResult, calculateCessions, computeTotalGain } from "@/lib/calculator";
import { Transaction } from "@/lib/types";
import { getCoinGeckoKey } from "@/lib/storage";
import { API_PLATFORMS, PLATFORMS } from "@/lib/platforms";

const QUICK_LINKS = [
  { href: '/import', label: 'Importer des transactions', hint: 'CSV ou connexion API', primary: true },
  { href: '/transactions', label: 'Cessions imposables', hint: 'Détail par année fiscale' },
  { href: '/cerfa', label: 'Cerfa 2086 / 3916-bis', hint: 'Export PDF prêt à déclarer' },
];

// Les plateformes citées sont dérivées du registre : la page reste juste
// lorsqu'on en ajoute ou en retire une.
const FEATURES_LIST = [
  `Import CSV depuis ${PLATFORMS.map((p) => p.label).join(', ')}`,
  `Connexion API en lecture seule (${API_PLATFORMS.map((p) => p.label).join(', ')}) pour récupérer l'historique complet`,
  "Plus-values calculées selon la méthode proportionnelle de l'article 150 VH bis",
  "Prix historiques CoinGecko, mis en cache localement entre deux sessions",
  "Revenus BNC (staking, mining, airdrop) isolés pour la case 5HQ",
  "Récapitulatif Cerfa 2086 et 3916-bis exportable en PDF",
];

type YearGain = { year: number; gain: number };

export default function Home() {
  const [chartData, setChartData] = useState<YearGain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/transactions', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Réponse invalide du serveur');
        return res.json();
      })
      .then(async (data: Array<Omit<Transaction, 'date'> & { date: string }>) => {
        if (!data || data.length === 0) return;

        const transactions: Transaction[] = data.map((tx) => ({ ...tx, date: new Date(tx.date) }));
        const cgApiKey = getCoinGeckoKey();
        const cessions = await calculateCessions(transactions, undefined, cgApiKey);

        const grouped = cessions.reduce((acc, cession) => {
          const year = cession.date.getFullYear();
          if (!acc[year]) acc[year] = [];
          acc[year].push(cession);
          return acc;
        }, {} as Record<number, CessionResult[]>);

        setChartData(
          Object.keys(grouped)
            .map(Number)
            .sort((a, b) => a - b)
            .map((year) => ({ year, gain: computeTotalGain(grouped[year]) }))
        );
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError("Impossible de charger vos transactions.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const maxAbsVal = chartData.length > 0
    ? Math.max(...chartData.map((d) => Math.abs(d.gain)), 1)
    : 1;

  const totalGain = chartData.reduce((sum, d) => sum + d.gain, 0);

  const fmtEur = (n: number) =>
    n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });

  return (
    <main className="px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-8">

        {/* ── En-tête ───────────────────────────────────────────────────── */}
        <section className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-600">
            Article 150 VH bis · CGI
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
            Votre impôt crypto, calculé en local
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
            Importez vos rapports d&apos;échange, visualisez vos cessions imposables et préparez
            votre Cerfa 2086 et 3916-bis. Aucune donnée ne quitte votre machine.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`group rounded-2xl px-5 py-4 transition ${
                  link.primary
                    ? 'bg-teal-600 text-white shadow-sm hover:bg-teal-700'
                    : 'border border-slate-200 bg-white text-slate-900 hover:border-teal-300 hover:bg-teal-50/40'
                }`}
              >
                <span className="block text-sm font-semibold">{link.label}</span>
                <span
                  className={`mt-1 block text-xs ${
                    link.primary ? 'text-teal-50' : 'text-slate-500'
                  }`}
                >
                  {link.hint}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Graphique ─────────────────────────────────────────────────── */}
        <section className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 sm:p-10">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-900">Plus-values par année fiscale</h2>
            {!loading && !error && chartData.length > 0 && (
              <p className="text-sm text-slate-500">
                Cumul&nbsp;:{' '}
                <span className={totalGain >= 0 ? 'font-semibold text-teal-700' : 'font-semibold text-red-600'}>
                  {totalGain >= 0 ? '+' : ''}{fmtEur(totalGain)} €
                </span>
              </p>
            )}
          </div>

          <div className="mt-8">
            {loading ? (
              // Squelette : reproduit la forme du graphique pour éviter le saut de mise en page
              <div className="flex h-64 items-end justify-around gap-4" aria-hidden="true">
                {[45, 70, 30, 55].map((h, i) => (
                  <div key={i} className="w-full max-w-16 animate-pulse rounded-t-lg bg-slate-100" style={{ height: `${h}%` }} />
                ))}
              </div>
            ) : error ? (
              <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
                <p className="text-sm font-medium text-red-600">{error}</p>
                <p className="text-xs text-slate-500">
                  Vérifiez que le serveur est bien démarré, puis rechargez la page.
                </p>
              </div>
            ) : chartData.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 text-center">
                <p className="text-sm text-slate-500">Aucune cession imposable pour le moment.</p>
                <Link
                  href="/import"
                  className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700"
                >
                  Importer vos transactions
                </Link>
              </div>
            ) : (
              <figure>
                {/* Grille : une colonne par année, barres partant d'un axe zéro central */}
                <div className="relative h-64">
                  <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-300" />
                  <div
                    className="grid h-full items-stretch gap-3"
                    style={{ gridTemplateColumns: `repeat(${chartData.length}, minmax(0, 1fr))` }}
                  >
                    {chartData.map((d) => {
                      const heightPct = (Math.abs(d.gain) / maxAbsVal) * 46;
                      const positive = d.gain >= 0;
                      return (
                        <div key={d.year} className="group relative flex flex-col">
                          {/* Moitié haute : gains */}
                          <div className="flex flex-1 items-end justify-center pb-0">
                            {positive && (
                              <div
                                className="relative w-full max-w-14 rounded-t-lg bg-teal-500 transition-colors group-hover:bg-teal-600"
                                style={{ height: `${(heightPct / 46) * 100}%` }}
                              >
                                <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-teal-700 opacity-0 transition-opacity group-hover:opacity-100">
                                  +{fmtEur(d.gain)} €
                                </span>
                              </div>
                            )}
                          </div>
                          {/* Moitié basse : pertes */}
                          <div className="flex flex-1 items-start justify-center">
                            {!positive && (
                              <div
                                className="relative w-full max-w-14 rounded-b-lg bg-red-500 transition-colors group-hover:bg-red-600"
                                style={{ height: `${(heightPct / 46) * 100}%` }}
                              >
                                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-red-700 opacity-0 transition-opacity group-hover:opacity-100">
                                  {fmtEur(d.gain)} €
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Axe des années, hors de la zone des barres : plus de chevauchement */}
                <div
                  className="mt-3 grid gap-3 border-t border-slate-200 pt-3"
                  style={{ gridTemplateColumns: `repeat(${chartData.length}, minmax(0, 1fr))` }}
                >
                  {chartData.map((d) => (
                    <div key={d.year} className="text-center">
                      <div className="text-sm font-medium text-slate-700">{d.year}</div>
                      <div className={`text-xs ${d.gain >= 0 ? 'text-teal-600' : 'text-red-500'}`}>
                        {d.gain >= 0 ? '+' : ''}{fmtEur(d.gain)} €
                      </div>
                    </div>
                  ))}
                </div>
                <figcaption className="sr-only">
                  Plus-values nettes par année fiscale, en euros.
                </figcaption>
              </figure>
            )}
          </div>
        </section>

        {/* ── Fonctionnalités ───────────────────────────────────────────── */}
        <section className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 sm:p-10">
          <h2 className="text-xl font-semibold text-slate-900">Ce que fait l&apos;outil</h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {FEATURES_LIST.map((feature) => (
              <li key={feature} className="flex gap-3 text-sm leading-relaxed text-slate-700">
                <span aria-hidden="true" className="mt-0.5 font-semibold text-teal-600">✓</span>
                {feature}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
