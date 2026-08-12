'use client';

import { FormEvent, useState } from 'react';
import { PLATFORMS, type PlatformId } from '@/lib/platforms';
import { TRANSACTION_TYPES, type Transaction, type TransactionType } from '@/lib/types';

export type EditableTransaction = Omit<Transaction, 'date'> & { date: string };

const TYPE_LABELS: Record<TransactionType, string> = {
  buy: 'Achat',
  sell: 'Vente',
  trade: 'Échange crypto→crypto',
  staking: 'Staking (revenu BNC)',
  mining: 'Minage (revenu BNC)',
  airdrop: 'Airdrop / récompense (BNC)',
  other: 'Autre (non imposable)',
};

/** Types pour lesquels l'imposition découle du type, sans choix de l'utilisateur. */
function defaultTaxable(type: TransactionType): boolean {
  // Seule une cession contre monnaie fiat est imposable : les échanges
  // crypto→crypto sont en sursis d'imposition (art. 150 VH bis, II-A).
  return type === 'sell';
}

export function TransactionForm({
  initial,
  onSubmit,
  onCancel,
  busy,
}: {
  initial?: EditableTransaction;
  onSubmit: (tx: EditableTransaction) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [form, setForm] = useState<EditableTransaction>(
    initial ?? {
      id: `manuel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: new Date().toISOString().slice(0, 10),
      platform: PLATFORMS[0].id,
      asset: '',
      qty: 0,
      priceEur: 0,
      fiatAmount: 0,
      type: 'buy',
      isTaxable: false,
    }
  );

  const set = <K extends keyof EditableTransaction>(key: K, value: EditableTransaction[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleTypeChange = (type: TransactionType) => {
    setForm((prev) => ({ ...prev, type, isTaxable: defaultTaxable(type) }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.asset.trim() || form.qty <= 0) return;
    onSubmit({
      ...form,
      asset: form.asset.trim().toUpperCase(),
      // La date est saisie en jour local : on la fige à midi UTC pour qu'aucun
      // décalage de fuseau ne la fasse basculer d'une année fiscale à l'autre.
      date: new Date(`${form.date}T12:00:00Z`).toISOString(),
    });
  };

  const field = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-200';
  const labelText = 'text-xs font-medium text-slate-700';

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-teal-200 bg-teal-50/40 p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className={labelText}>Date</span>
          <input
            type="date" required value={form.date.slice(0, 10)}
            onChange={(e) => set('date', e.target.value)} className={field}
          />
        </label>

        <label className="block">
          <span className={labelText}>Plateforme</span>
          <select
            value={form.platform}
            onChange={(e) => set('platform', e.target.value as PlatformId)}
            className={field}
          >
            {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>

        <label className="block">
          <span className={labelText}>Type d&apos;opération</span>
          <select
            value={form.type}
            onChange={(e) => handleTypeChange(e.target.value as TransactionType)}
            className={field}
          >
            {TRANSACTION_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </label>

        <label className="block">
          <span className={labelText}>Actif (ex : BTC)</span>
          <input
            type="text" required value={form.asset} placeholder="BTC"
            onChange={(e) => set('asset', e.target.value)}
            className={`${field} uppercase`}
          />
        </label>

        <label className="block">
          <span className={labelText}>Quantité</span>
          <input
            type="number" required step="any" min="0" value={form.qty || ''}
            onChange={(e) => set('qty', Number(e.target.value))} className={field}
          />
        </label>

        <label className="block">
          <span className={labelText}>Montant total (€)</span>
          <input
            type="number" step="any" min="0" value={form.fiatAmount || ''}
            onChange={(e) => {
              const fiatAmount = Number(e.target.value);
              // Le prix unitaire se déduit du montant : une saisie suffit
              setForm((prev) => ({
                ...prev,
                fiatAmount,
                priceEur: prev.qty > 0 ? fiatAmount / prev.qty : prev.priceEur,
              }));
            }}
            className={field}
          />
        </label>

        <label className="block">
          <span className={labelText}>Prix unitaire (€)</span>
          <input
            type="number" step="any" min="0" value={form.priceEur || ''}
            onChange={(e) => set('priceEur', Number(e.target.value))} className={field}
          />
        </label>

        <label className="block">
          <span className={labelText}>Frais (€) <span className="font-normal text-slate-400">optionnel</span></span>
          <input
            type="number" step="any" min="0" value={form.feeEur ?? ''}
            onChange={(e) => set('feeEur', e.target.value ? Number(e.target.value) : undefined)}
            className={field}
          />
        </label>

        <label className="flex items-end gap-2 pb-2">
          <input
            type="checkbox" checked={form.isTaxable}
            onChange={(e) => set('isTaxable', e.target.checked)}
            className="h-4 w-4 rounded accent-teal-600"
          />
          <span className="text-xs text-slate-700">Cession imposable</span>
        </label>
      </div>

      {form.type === 'trade' && (
        <div className="mt-4 grid gap-4 border-t border-teal-200 pt-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelText}>Actif reçu</span>
            <input
              type="text" value={form.receivedAsset ?? ''} placeholder="ETH"
              onChange={(e) => set('receivedAsset', e.target.value.toUpperCase())}
              className={`${field} uppercase`}
            />
          </label>
          <label className="block">
            <span className={labelText}>Quantité reçue</span>
            <input
              type="number" step="any" min="0" value={form.receivedQty ?? ''}
              onChange={(e) => set('receivedQty', e.target.value ? Number(e.target.value) : undefined)}
              className={field}
            />
          </label>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="submit" disabled={busy}
          className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50"
        >
          {initial ? 'Enregistrer les modifications' : 'Ajouter la transaction'}
        </button>
        <button
          type="button" onClick={onCancel}
          className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-400"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
