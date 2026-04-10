'use client';

import { useEffect, useState, FormEvent } from 'react';
import { CessionResult, BNCResult, calculateCessions, computeBNCIncome, computeTotalGain } from '@/lib/calculator';
import { Transaction } from '@/lib/types';

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
        const cgApiKey = localStorage.getItem('crypto-tax-coingecko') ?? undefined;
        setCessions(await calculateCessions(transactions, undefined, cgApiKey));
        setBncResults(computeBNCIncome(transactions));
      })
      .catch((err) => { if (err.name !== 'AbortError') {} })
      .finally(() => setLoading(false));

    // Charger les comptes 3916-bis depuis le localStorage (pour préserver la vie privée)
    const saved = localStorage.getItem('crypto-tax-3916');
    if (saved) {
      try { setAccounts(JSON.parse(saved)); } catch { /* ignorer */ }
    }

    return () => controller.abort();
  }, []);

  const saveAccounts = (accs: ForeignAccount[]) => {
    setAccounts(accs);
    localStorage.setItem('crypto-tax-3916', JSON.stringify(accs));
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
    setYearlyFees(prev => ({ ...prev, [year]: value }));
  };

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto max-w-5xl space-y-10 print:space-y-6">

        {/* En-tête (masqué à l'impression) */}
        <div className="print:hidden rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-200">
          <h1 className="text-3xl font-semibold text-slate-900">Déclaration Cerfa</h1>
          <p className="mt-2 text-sm text-slate-600">
            Aide à la déclaration de vos plus-values (Cerfa 2086) et de vos comptes d&apos;actifs numériques détenus à l&apos;étranger (Cerfa 3916-bis).
          </p>
          <div className="mt-6 flex gap-4">
            <button onClick={() => window.print()} className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 transition">
              🖨️ Imprimer la fiche récapitulative
            </button>
          </div>
        </div>

        {/* CERFA 2086 */}
        <section className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-200 print:shadow-none print:ring-0 print:p-0">
          <h2 className="text-2xl font-semibold text-slate-900 border-b pb-4 mb-6">Cerfa 2086 — Plus-values</h2>
          {loading ? (
            <p className="text-slate-500 text-sm">Calcul en cours...</p>
          ) : cessions.length === 0 ? (
            <p className="text-slate-500 text-sm">Aucune cession imposable trouvée pour générer la déclaration.</p>
          ) : (
            <div className="space-y-10 print:space-y-8">
              {years.map((year) => {
                const yearCessions = groupedCessions[year];
                const yearGain = computeTotalGain(yearCessions);
                const yearProceeds = yearCessions.reduce((sum, c) => sum + c.grossProceeds, 0);

                const fee = parseFloat(yearlyFees[year]) || 0;
                const adjustedGain = yearGain - fee;
                // 3VH = total brut des cessions (les frais réduisent la plus-value, pas le total des cessions)
                const adjustedProceeds = yearProceeds;

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
                        <p className="text-2xl font-bold text-slate-900">{adjustedGain > 0 ? adjustedGain.toFixed(0) : 0} €</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-5 border border-slate-200">
                        <p className="text-sm text-slate-500 font-medium mb-1">Case 3BN (Moins-value)</p>
                        <p className="text-2xl font-bold text-slate-900">{adjustedGain < 0 ? Math.abs(adjustedGain).toFixed(0) : 0} €</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-5 border border-slate-200">
                        <p className="text-sm text-slate-500 font-medium mb-1">Case 3VH (Total cessions)</p>
                        <p className="text-2xl font-bold text-slate-900">{adjustedProceeds.toFixed(0)} €</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* BNC — Staking / Mining / Airdrop */}
        {bncResults.length > 0 && (() => {
          const byYear = bncResults.reduce((acc, r) => {
            const y = r.date.getFullYear();
            if (!acc[y]) acc[y] = { total: 0, staking: 0, mining: 0, airdrop: 0 };
            acc[y].total += r.incomeEur;
            acc[y][r.type] += r.incomeEur;
            return acc;
          }, {} as Record<number, { total: number; staking: number; mining: number; airdrop: number }>);
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
            <p className="text-slate-500 text-sm">Aucun compte renseigné. Cliquez sur "+ Ajouter un compte" pour commencer.</p>
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