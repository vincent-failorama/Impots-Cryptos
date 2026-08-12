'use client';

import { useEffect, useState, FormEvent } from 'react';
import {
  CessionResult, BNCResult, calculateCessions, computeBNCIncome, computeYearSummary,
  EXEMPTION_THRESHOLD_EUR, PFU,
} from '@/lib/calculator';
import { Transaction } from '@/lib/types';
import { getPlatform } from '@/lib/platforms';
import { STORAGE_KEYS, getCoinGeckoKey, readJson, writeJson } from '@/lib/storage';

type ForeignAccount = {
  id: string;
  institution: string;
  url: string;
  country: string;
  accountNumber: string;
  openingDate: string;
  closingDate?: string;
};

const FORM_FIELDS: { key: keyof ForeignAccount; label: string; type: string; required?: boolean }[] = [
  { key: 'institution', label: 'Institution (ex: Binance)', type: 'text', required: true },
  { key: 'url', label: 'URL du site (ex: https://binance.com)', type: 'url' },
  { key: 'country', label: 'Pays (ex: Malte)', type: 'text', required: true },
  { key: 'accountNumber', label: 'Numéro de compte (UID)', type: 'text', required: true },
  { key: 'openingDate', label: "Date d'ouverture", type: 'date', required: true },
  { key: 'closingDate', label: 'Date de fermeture (si applicable)', type: 'date' },
];

export default function CerfaPage() {
  const [cessions, setCessions] = useState<CessionResult[]>([]);
  const [bncResults, setBncResults] = useState<BNCResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);

  const [accounts, setAccounts] = useState<ForeignAccount[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newAccount, setNewAccount] = useState<Partial<ForeignAccount>>({});
  const [yearlyFees, setYearlyFees] = useState<Record<number, string>>({});

  useEffect(() => {
    const controller = new AbortController();

    // Charger et calculer les cessions pour le Cerfa 2086
    fetch('/api/transactions', { signal: controller.signal })
      .then((res) => res.json())
      .then(async (data: Array<Omit<Transaction, 'date'> & { date: string }>) => {
        const transactions: Transaction[] = data.map((tx) => ({ ...tx, date: new Date(tx.date) }));
        const cgApiKey = getCoinGeckoKey();
        setCessions(await calculateCessions(transactions, undefined, cgApiKey));
        setBncResults(computeBNCIncome(transactions));
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError('Impossible de charger les transactions.');
      })
      .finally(() => setLoading(false));

    // Comptes 3916-bis : conservés uniquement dans le navigateur (vie privée)
    setAccounts(readJson<ForeignAccount[]>(STORAGE_KEYS.foreignAccounts, []));
    // Les frais déductibles alimentent le PDF : ils doivent survivre au rechargement
    setYearlyFees(readJson<Record<number, string>>(STORAGE_KEYS.deductibleFees, {}));

    return () => controller.abort();
  }, []);

  const saveAccounts = (accs: ForeignAccount[]) => {
    setAccounts(accs);
    writeJson(STORAGE_KEYS.foreignAccounts, accs);
  };

  const handleAddAccount = (e: FormEvent) => {
    e.preventDefault();
    if (!newAccount.institution || !newAccount.country || !newAccount.accountNumber || !newAccount.openingDate) return;

    const acc: ForeignAccount = {
      id: Math.random().toString(36).substring(2, 9),
      institution: newAccount.institution,
      url: newAccount.url || '',
      country: newAccount.country,
      accountNumber: newAccount.accountNumber,
      openingDate: newAccount.openingDate,
      closingDate: newAccount.closingDate,
    };

    saveAccounts([...accounts, acc]);
    setNewAccount({});
    setShowForm(false);
  };

  const handleDeleteAccount = (id: string) => {
    if (confirm('Supprimer ce compte de votre liste ?')) {
      saveAccounts(accounts.filter(a => a.id !== id));
    }
  };

  const groupedCessions = cessions.reduce((acc, cession) => {
    const year = cession.date.getFullYear();
    if (!acc[year]) acc[year] = [];
    acc[year].push(cession);
    return acc;
  }, {} as Record<number, CessionResult[]>);

  const years = Object.keys(groupedCessions).map(Number).sort((a, b) => b - a); // Tri décroissant

  const handleFeeChange = (year: number, value: string) => {
    setYearlyFees(prev => {
      const next = { ...prev, [year]: value };
      writeJson(STORAGE_KEYS.deductibleFees, next);
      return next;
    });
  };

  /** Synthèse fiscale par année : assiette, seuil des 305 € et impôt estimé. */
  const yearSummaries = years.map((year) =>
    computeYearSummary(year, groupedCessions[year], parseFloat(yearlyFees[year]) || 0)
  );

  const bncByYear = bncResults.reduce((acc, r) => {
    const y = r.date.getFullYear();
    if (!acc[y]) acc[y] = { total: 0, staking: 0, mining: 0, airdrop: 0 };
    acc[y].total += r.incomeEur;
    acc[y][r.type] += r.incomeEur;
    return acc;
  }, {} as Record<number, { total: number; staking: number; mining: number; airdrop: number }>);

  const handleDownloadPdf = async () => {
    setPdfBusy(true);
    setError('');
    try {
      // pdf-lib pèse ~180 kB : on ne le charge qu'au moment de l'export, pour
      // ne pas alourdir le premier rendu de la page.
      const { generateCerfaPdf } = await import('@/lib/cerfa');

      const bytes = await generateCerfaPdf({
        generatedAt: new Date(),
        years: yearSummaries.map((y) => ({
          year: y.year,
          case3AN: y.case3AN,
          case3BN: y.case3BN,
          case3VH: y.totalProceeds,
          cessionCount: y.cessionCount,
          isExempt: y.isExempt,
          incomeTax: y.incomeTax,
          socialCharges: y.socialCharges,
          totalTax: y.totalTax,
          // Détail ligne à ligne exigé par le formulaire 2086
          cessions: [...groupedCessions[y.year]]
            .sort((a, b) => a.date.getTime() - b.date.getTime())
            .map((c) => ({
              date: c.date,
              asset: c.asset,
              platform: getPlatform(c.platform).label,
              proceeds: c.grossProceeds,
              portfolioValue: c.portfolioValueAtSale,
              totalCostBasis: c.globalCostBasisBefore,
              imputedCost: c.acquisitionCost,
              gainLoss: c.gainLoss,
              valuationCertain: c.portfolioValueCertain,
            })),
        })),
        bnc: Object.keys(bncByYear).map(Number).sort((a, b) => b - a).map((year) => ({
          year, ...bncByYear[year],
        })),
        accounts: accounts.map((a) => ({
          institution: a.institution,
          url: a.url,
          country: a.country,
          accountNumber: a.accountNumber,
          openingDate: a.openingDate,
          closingDate: a.closingDate,
        })),
      });

      // Uint8Array -> Blob : on passe par un ArrayBuffer pour satisfaire BlobPart
      const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `recapitulatif-fiscal-crypto-${new Date().getFullYear()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Échec de la génération du PDF : ${err instanceof Error ? err.message : 'erreur inconnue'}`);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <main className="px-6 py-10 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto max-w-5xl space-y-10 print:space-y-6">

        {/* En-tête (masqué à l'impression) */}
        <div className="print:hidden rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-200">
          <h1 className="text-3xl font-semibold text-slate-900">Déclaration Cerfa</h1>
          <p className="mt-2 text-sm text-slate-600">
            Aide à la déclaration de vos plus-values (Cerfa 2086) et de vos comptes d&apos;actifs numériques détenus à l&apos;étranger (Cerfa 3916-bis).
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={handleDownloadPdf}
              disabled={pdfBusy || loading}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pdfBusy ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Génération…
                </>
              ) : (
                <>↓ Télécharger le PDF</>
              )}
            </button>
            <button
              onClick={() => window.print()}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900"
            >
              Imprimer la fiche
            </button>
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        {/* CERFA 2086 */}
        <section className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-200 print:shadow-none print:ring-0 print:p-0">
          <h2 className="text-2xl font-semibold text-slate-900 border-b pb-4 mb-6">Cerfa 2086 — Plus-values</h2>
          {loading ? (
            <p className="text-slate-500 text-sm animate-pulse">Calcul en cours…</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : cessions.length === 0 ? (
            <p className="text-slate-500 text-sm">Aucune cession imposable trouvée pour générer la déclaration.</p>
          ) : (
            <div className="space-y-10 print:space-y-8">
              {yearSummaries.map((summary) => {
                const year = summary.year;

                return (
                  <div key={year} className="space-y-4 break-inside-avoid">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <h3 className="text-lg font-semibold text-slate-800">Année fiscale {year}</h3>
                      <label className="print:hidden flex items-center gap-3 text-sm text-slate-700 bg-slate-100/50 px-3 py-2 rounded-xl border border-slate-200">
                        <span className="font-medium">Frais déductibles (€) :</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={yearlyFees[year] !== undefined ? yearlyFees[year] : ''}
                          onChange={(e) => handleFeeChange(year, e.target.value)}
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                          placeholder="0.00"
                        />
                      </label>
                    </div>
                    <div className="grid gap-6 sm:grid-cols-3">
                      <div className="rounded-2xl bg-slate-50 p-5 border border-slate-200">
                        <p className="text-sm text-slate-500 font-medium mb-1">Case 3AN (Plus-value)</p>
                        <p className="text-2xl font-bold text-slate-900">{summary.case3AN.toFixed(0)} €</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-5 border border-slate-200">
                        <p className="text-sm text-slate-500 font-medium mb-1">Case 3BN (Moins-value)</p>
                        <p className="text-2xl font-bold text-slate-900">{summary.case3BN.toFixed(0)} €</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-5 border border-slate-200">
                        <p className="text-sm text-slate-500 font-medium mb-1">Case 3VH (Total cessions)</p>
                        <p className="text-2xl font-bold text-slate-900">{summary.totalProceeds.toFixed(0)} €</p>
                      </div>
                    </div>

                    {/* Estimation de l'impôt dû */}
                    {summary.isExempt ? (
                      <div className="rounded-2xl border border-teal-200 bg-teal-50 p-5">
                        <p className="text-sm font-semibold text-teal-900">
                          Exonéré — total des cessions inférieur à {EXEMPTION_THRESHOLD_EUR} €
                        </p>
                        <p className="mt-1.5 text-sm leading-relaxed text-teal-800">
                          L&apos;article 150 VH bis exonère les plus-values lorsque la somme des prix
                          de cession de l&apos;année n&apos;excède pas {EXEMPTION_THRESHOLD_EUR} €.
                          Les cessions restent à déclarer, mais aucun impôt n&apos;est dû.
                        </p>
                      </div>
                    ) : summary.taxableBase > 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">Impôt estimé</p>
                          <p className="text-2xl font-bold text-slate-900">
                            {summary.totalTax.toFixed(0)} €
                          </p>
                        </div>
                        <dl className="mt-4 space-y-1.5 text-sm text-slate-600">
                          <div className="flex justify-between gap-4">
                            <dt>Impôt sur le revenu ({(PFU.incomeTaxRate * 100).toFixed(1)} %)</dt>
                            <dd className="tabular-nums">{summary.incomeTax.toFixed(0)} €</dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt>Prélèvements sociaux ({(PFU.socialChargesRate * 100).toFixed(1)} %)</dt>
                            <dd className="tabular-nums">{summary.socialCharges.toFixed(0)} €</dd>
                          </div>
                          <div className="flex justify-between gap-4 border-t border-slate-100 pt-1.5 font-medium text-slate-900">
                            <dt>Assiette imposable</dt>
                            <dd className="tabular-nums">{summary.taxableBase.toFixed(0)} €</dd>
                          </div>
                        </dl>
                        <p className="mt-3 text-xs leading-relaxed text-slate-500">
                          Prélèvement forfaitaire unique de 30 %. Vous pouvez opter pour le barème
                          progressif de l&apos;impôt sur le revenu : les prélèvements sociaux restent
                          dus au même taux, seule la part d&apos;impôt varie selon votre tranche.
                          {summary.hasUncertainValuation && ' Certaines cessions reposent sur une valeur de portefeuille estimée : ce montant peut être inexact.'}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <p className="text-sm text-slate-600">
                          Aucun impôt dû : l&apos;année se solde par une moins-value.
                          Elle s&apos;impute sur les plus-values de la même année et n&apos;est pas
                          reportable sur les années suivantes.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* BNC — Staking / Mining / Airdrop */}
        {bncResults.length > 0 && (() => {
          const byYear = bncByYear;
          const bncYears = Object.keys(byYear).map(Number).sort((a, b) => b - a);
          return (
            <section className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-200 print:shadow-none print:ring-0 print:p-0">
              <h2 className="text-2xl font-semibold text-slate-900 border-b pb-4 mb-6">BNC — Staking / Mining / Airdrop</h2>
              <p className="text-sm text-slate-600 mb-6">
                Ces revenus sont imposables en <strong>Bénéfices Non Commerciaux (BNC)</strong> à la date de réception,
                indépendamment de la plus-value. À reporter sur votre <strong>2042-C-PRO</strong> (case 5HQ si non professionnel).
              </p>
              <div className="space-y-6">
                {bncYears.map(year => {
                  const d = byYear[year];
                  return (
                    <div key={year} className="space-y-3">
                      <h3 className="text-lg font-semibold text-slate-800">{year}</h3>
                      <div className="grid gap-4 sm:grid-cols-4">
                        <div className="rounded-2xl bg-slate-50 p-5 border border-slate-200 sm:col-span-1">
                          <p className="text-sm text-slate-500 font-medium mb-1">Total BNC</p>
                          <p className="text-2xl font-bold text-slate-900">{d.total.toFixed(0)} €</p>
                          <p className="text-xs text-amber-700 mt-1">Case 5HQ</p>
                        </div>
                        {d.staking > 0 && (
                          <div className="rounded-2xl bg-slate-50 p-5 border border-slate-200">
                            <p className="text-sm text-slate-500 font-medium mb-1">Staking</p>
                            <p className="text-xl font-semibold text-slate-900">{d.staking.toFixed(0)} €</p>
                          </div>
                        )}
                        {d.mining > 0 && (
                          <div className="rounded-2xl bg-slate-50 p-5 border border-slate-200">
                            <p className="text-sm text-slate-500 font-medium mb-1">Mining</p>
                            <p className="text-xl font-semibold text-slate-900">{d.mining.toFixed(0)} €</p>
                          </div>
                        )}
                        {d.airdrop > 0 && (
                          <div className="rounded-2xl bg-slate-50 p-5 border border-slate-200">
                            <p className="text-sm text-slate-500 font-medium mb-1">Airdrop</p>
                            <p className="text-xl font-semibold text-slate-900">{d.airdrop.toFixed(0)} €</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-6 text-xs text-slate-400">
                Les montants BNC sont calculés à partir des valeurs EUR présentes dans vos exports CSV.
                Si la valeur EUR n&apos;est pas incluse dans l&apos;export, le prix unitaire × quantité est utilisé.
                Vérifiez ces montants avec vos relevés de plateforme.
              </p>
            </section>
          );
        })()}

        {/* CERFA 3916-bis */}
        <section className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-200 print:shadow-none print:ring-0 print:p-0 print:mt-10 border-t-0 print:border-t print:border-slate-300 print:pt-8">
          <div className="flex items-center justify-between border-b pb-4 mb-6">
            <h2 className="text-2xl font-semibold text-slate-900">Cerfa 3916-bis — Comptes à l&apos;étranger</h2>
            <button
              onClick={() => setShowForm(!showForm)}
              className="print:hidden text-sm font-medium text-teal-600 hover:text-teal-700"
            >
              {showForm ? 'Annuler la saisie' : '+ Ajouter un compte'}
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleAddAccount} className="print:hidden mb-8 rounded-2xl border border-teal-100 bg-teal-50/50 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                {FORM_FIELDS.map(f => (
                  <label key={f.key} className="block">
                    <span className="text-sm font-medium text-slate-700">{f.label}</span>
                    <input
                      type={f.type}
                      required={f.required}
                      value={(newAccount[f.key] as string) || ''}
                      onChange={e => setNewAccount({ ...newAccount, [f.key]: e.target.value })}
                      className="mt-1 block w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                    />
                  </label>
                ))}
              </div>
              <button type="submit" className="mt-5 rounded-xl bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700">
                Enregistrer le compte
              </button>
            </form>
          )}

          {accounts.length === 0 ? (
            <p className="text-slate-500 text-sm">Aucun compte renseigné. Cliquez sur &quot;+ Ajouter un compte&quot; pour commencer.</p>
          ) : (
            <div className="space-y-6 print:space-y-4">
              {accounts.map(acc => (
                <div key={acc.id} className="relative rounded-2xl border border-slate-200 bg-slate-50 p-6 print:border-slate-300 print:bg-transparent print:p-4 break-inside-avoid">
                  <button onClick={() => handleDeleteAccount(acc.id)} className="print:hidden absolute right-4 top-4 text-xs font-medium text-red-500 hover:text-red-700 hover:underline">
                    Supprimer
                  </button>
                  <h3 className="text-lg font-semibold text-slate-900">{acc.institution}</h3>
                  <div className="mt-4 grid gap-y-3 gap-x-8 sm:grid-cols-2 text-sm text-slate-700">
                    <div><span className="font-medium text-slate-900">URL :</span> {acc.url || 'Non spécifiée'}</div>
                    <div><span className="font-medium text-slate-900">Pays :</span> {acc.country}</div>
                    <div><span className="font-medium text-slate-900">Num. de compte :</span> {acc.accountNumber}</div>
                    <div>
                      <span className="font-medium text-slate-900">Période :</span>{' '}
                      Ouvert le {new Date(acc.openingDate).toLocaleDateString('fr-FR')}
                      {acc.closingDate ? ` - Fermé le ${new Date(acc.closingDate).toLocaleDateString('fr-FR')}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}