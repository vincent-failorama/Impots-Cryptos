'use client';

import React, { useState, ChangeEvent } from 'react';
import Link from 'next/link';
import type { Transaction } from '@/lib/types';
import { parseBinanceCsv } from '@/lib/parsers/binance';
import { parseBitgetCsv } from '@/lib/parsers/bitget';
import { parseKrakenCsv } from '@/lib/parsers/kraken';
import { parseGateCsv } from '@/lib/parsers/gate';
import { parseKucoinCsv } from '@/lib/parsers/kucoin';
import { parseCoinbaseCsv } from '@/lib/parsers/coinbase';

const platforms: Array<{ value: string; label: string }> = [
  { value: 'binance', label: 'Binance' },
  { value: 'bitget', label: 'Bitget' },
  { value: 'coinbase', label: 'Coinbase' },
  { value: 'gate', label: 'Gate.io' },
  { value: 'kraken', label: 'Kraken' },
  { value: 'kucoin', label: 'KuCoin' },
];

function parseCsv(platform: string, csv: string): Transaction[] {
  switch (platform) {
    case 'binance':  return parseBinanceCsv(csv);
    case 'bitget':   return parseBitgetCsv(csv);
    case 'kraken':   return parseKrakenCsv(csv);
    case 'gate':     return parseGateCsv(csv);
    case 'kucoin':   return parseKucoinCsv(csv);
    case 'coinbase': return parseCoinbaseCsv(csv);
    default: return [];
  }
}

async function saveTransactions(transactions: Transaction[]): Promise<{ saved: number; duplicates: number }> {
  const res = await fetch('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(transactions),
  });
  if (!res.ok) throw new Error('Erreur lors de la sauvegarde.');
  return res.json();
}

// ── Composant CSV ─────────────────────────────────────────────────────────────

function CsvImport() {
  const [platform, setPlatform] = useState<string>('binance');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setMessage('');
    try {
      const text = await file.text();
      const transactions = parseCsv(platform, text);
      if (transactions.length === 0) {
        setMessage('Aucune transaction trouvée. Vérifiez la plateforme sélectionnée et le format du fichier.');
        return;
      }
      const { saved, duplicates } = await saveTransactions(transactions);
      const dupNote = duplicates > 0 ? ` (${duplicates} doublon(s) ignoré(s))` : '';
      setMessage(`✓ ${saved} transaction(s) importée(s)${dupNote} depuis ${file.name}.`);
    } catch (err) {
      setMessage(`Erreur : ${err instanceof Error ? err.message : 'Inconnue'}`);
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <strong>Limite Binance :</strong> l&apos;export CSV Binance est limité à 6 mois par fichier.
        Pour un historique complet, utilisez l&apos;onglet <strong>Via API</strong> ci-dessus,
        ou exportez et importez plusieurs périodes successives.
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Plateforme</span>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
          >
            {platforms.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Fichier CSV</span>
          <input
            type="file"
            accept=".csv"
            disabled={loading}
            onChange={handleUpload}
            className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm disabled:opacity-50"
          />
        </label>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        {loading ? 'Importation en cours…' : (message || 'Choisissez un fichier CSV pour importer.')}
      </div>
    </div>
  );
}

// ── Composant API Multi-Brokers ───────────────────────────────────────────────

const apiPlatforms: Array<{ value: string; label: string }> = [
  { value: 'binance', label: 'Binance' },
  { value: 'kraken', label: 'Kraken' },
  { value: 'coinbase', label: 'Coinbase' },
  { value: 'gate', label: 'Gate.io' },
  { value: 'kucoin', label: 'KuCoin' },
];

const STORAGE_KEY = (p: string) => `crypto-tax-api-${p}`;

function loadSavedKeys(platform: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(platform));
    return raw ? JSON.parse(raw) as { key: string; secret: string; passphrase: string } : null;
  } catch { return null; }
}

function saveKeys(platform: string, key: string, secret: string, passphrase: string) {
  try { localStorage.setItem(STORAGE_KEY(platform), JSON.stringify({ key, secret, passphrase })); } catch { /* ignore */ }
}

function clearKeys(platform: string) {
  try { localStorage.removeItem(STORAGE_KEY(platform)); } catch { /* ignore */ }
}

function BrokerApiImport() {
  const [platform, setPlatform] = useState<string>('binance');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [apiPassphrase, setApiPassphrase] = useState('');
  const [remember, setRemember] = useState(true);
  const [hasSaved, setHasSaved] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState('');

  // Charge les clés sauvegardées au changement de plateforme
  React.useEffect(() => {
    const saved = loadSavedKeys(platform);
    setApiKey(saved?.key ?? '');
    setApiSecret(saved?.secret ?? '');
    setApiPassphrase(saved?.passphrase ?? '');
    setHasSaved(!!saved);
    setMessage('');
    setStatus('idle');
  }, [platform]);

  const handleForget = () => {
    clearKeys(platform);
    setApiKey('');
    setApiSecret('');
    setApiPassphrase('');
    setHasSaved(false);
  };

  const handleFetch = async () => {
    if (!apiKey.trim() || !apiSecret.trim()) {
      setMessage('Renseignez la clé API et le secret.');
      return;
    }
    if (remember) {
      saveKeys(platform, apiKey.trim(), apiSecret.trim(), apiPassphrase.trim());
      setHasSaved(true);
    }
    setStatus('loading');
    setProgress(`Connexion à l'API ${apiPlatforms.find(p => p.value === platform)?.label}…`);
    setMessage('');

    try {
      const res = await fetch(`/api/fetch/${platform}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          apiSecret: apiSecret.trim(),
          apiPassphrase: apiPassphrase.trim()
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erreur inconnue' }));
        setMessage(err.error ?? `Erreur API ${platform}.`);
        setStatus('error');
        return;
      }

      setProgress('Sauvegarde des transactions…');
      const data = await res.json() as { transactions: Transaction[]; count: number; symbolsQueried?: number; errors?: string[] };

      if (data.count === 0) {
        setMessage(`Aucune transaction trouvée sur ce compte ${platform}.`);
        setStatus('done');
        return;
      }

      const { saved, duplicates } = await saveTransactions(data.transactions);
      const dupNote = duplicates > 0 ? `, ${duplicates} doublon(s) ignoré(s)` : '';
      
      let extNote = '';
      if ((platform === 'binance' || platform === 'gate') && data.symbolsQueried) {
        extNote = ` sur ${data.symbolsQueried} paires interrogées.`;
      }
      const errNote = data.errors?.length ? ` — ${data.errors.length} erreur(s).` : '';
      
      setMessage(`✓ ${saved} transaction(s) importée(s)${dupNote}${extNote}${errNote}`);
      setStatus('done');
    } catch (err) {
      setMessage(`Erreur : ${err instanceof Error ? err.message : 'Inconnue'}`);
      setStatus('error');
    } finally {
      setProgress('');
    }
  };

  let platformNote = '';
  if (platform === 'binance') {
    platformNote = 'Créez une clé API en lecture seule (permission "Enable Reading" uniquement — n\'activez pas le trading ni les retraits).';
  } else if (platform === 'kraken') {
    platformNote = 'Créez une clé API avec les permissions "Query Funds" et "Query Closed Orders & Trades" uniquement.';
  } else if (platform === 'coinbase') {
    platformNote = 'Créez une clé API (Legacy API Key) avec la permission "brokerage:orders:read" ou "wallet:trades:read" uniquement.';
  } else if (platform === 'gate') {
    platformNote = 'Créez une clé API v4 en lecture seule (permission "Spot Trade" configurée sur "Read Only").';
  } else if (platform === 'kucoin') {
    platformNote = 'Créez une clé API Trading avec la permission "General" uniquement. Renseignez également la phrase secrète (Passphrase) créée avec la clé.';
  }

  return (
    <div className="space-y-6">
      {/* Avertissement sécurité */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 space-y-2">
        <p className="font-semibold">Sécurité de la clé API</p>
        <p>{platformNote}</p>
        <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded accent-teal-600"
            />
            <span>Mémoriser les clés dans le navigateur (localStorage)</span>
          </label>
          {hasSaved && (
            <button
              type="button"
              onClick={handleForget}
              className="text-xs underline text-blue-700 hover:text-red-600"
            >
              Oublier les clés sauvegardées
            </button>
          )}
        </div>
      </div>

      <div className={`grid gap-4 ${platform === 'kucoin' ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Plateforme API</span>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
          >
            {apiPlatforms.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Clé API</span>
          <input
            type="text"
            value={apiKey}
            placeholder={`Votre clé API`}
            autoComplete="off"
            onChange={(e) => setApiKey(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-xs text-slate-900 shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Secret API</span>
          <input
            type="password"
            value={apiSecret}
            placeholder="Votre secret API"
            autoComplete="off"
            onChange={(e) => setApiSecret(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-xs text-slate-900 shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
          />
        </label>

        {platform === 'kucoin' && (
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Passphrase</span>
            <input
              type="password"
              value={apiPassphrase}
              placeholder="Phrase secrète"
              autoComplete="off"
              onChange={(e) => setApiPassphrase(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-xs text-slate-900 shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
            />
          </label>
        )}
      </div>

      <button
        type="button"
        disabled={status === 'loading'}
        onClick={handleFetch}
        className="inline-flex items-center gap-2 rounded-2xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
      >
        {status === 'loading' ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            {progress || 'Récupération en cours…'}
          </>
        ) : (
          `Récupérer tout l'historique ${apiPlatforms.find(p => p.value === platform)?.label}`
        )}
      </button>

      {message && (
        <div className={`rounded-2xl border p-4 text-sm ${
          status === 'error'
            ? 'border-red-200 bg-red-50 text-red-800'
            : 'border-slate-200 bg-slate-50 text-slate-700'
        }`}>
          {message}
        </div>
      )}

      {(platform === 'binance' || platform === 'gate') && (
        <p className="text-xs text-slate-400">
          L&apos;import {apiPlatforms.find(p => p.value === platform)?.label} interroge toutes les paires majeures (EUR, USDT, USDC, BTC, ETH) disponibles.
          Opération pouvant prendre 30 à 60 secondes selon le nombre de paires.
        </p>
      )}
    </div>
  );
}

// ── Clé API CoinGecko ─────────────────────────────────────────────────────────

const CG_STORAGE_KEY = 'crypto-tax-coingecko';

function CoingeckoKeySection() {
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);

  React.useEffect(() => {
    const stored = localStorage.getItem(CG_STORAGE_KEY);
    if (stored) { setKey(stored); setSaved(true); }
  }, []);

  const handleSave = () => {
    const k = key.trim();
    if (!k) return;
    localStorage.setItem(CG_STORAGE_KEY, k);
    setSaved(true);
  };

  const handleClear = () => {
    localStorage.removeItem(CG_STORAGE_KEY);
    setKey('');
    setSaved(false);
  };

  return (
    <div className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-200">
      <h2 className="text-xl font-semibold text-slate-900">Clé API CoinGecko <span className="text-sm font-normal text-slate-400">(optionnel)</span></h2>
      <p className="mt-2 text-sm text-slate-600">
        Sans clé, l&apos;API publique est limitée à ~10–30 req/min — un délai de <strong>1,5 s</strong> est appliqué entre chaque requête.
        Avec une <strong>clé Demo gratuite</strong> (coingecko.com/api), le délai tombe à <strong>0,5 s</strong> et les erreurs 429 disparaissent.
      </p>
      <div className="mt-4 flex flex-wrap gap-3 items-center">
        <input
          type="password"
          value={key}
          onChange={e => { setKey(e.target.value); setSaved(false); }}
          placeholder="CG-xxxxxxxxxxxxxxxxxxxx"
          className="flex-1 min-w-48 rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-xs text-slate-900 shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!key.trim() || saved}
          className="rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition"
        >
          {saved ? '✓ Sauvegardée' : 'Sauvegarder'}
        </button>
        {saved && (
          <button type="button" onClick={handleClear} className="text-sm text-slate-400 underline hover:text-red-500">
            Supprimer
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Stockée uniquement dans votre navigateur (localStorage). Jamais transmise à un tiers.
      </p>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

type Tab = 'csv' | 'api';

export default function ImportPage() {
  const [tab, setTab] = useState<Tab>('csv');
  const [clearing, setClearing] = useState(false);
  const [clearMsg, setClearMsg] = useState('');

  const handleClear = async () => {
    if (!confirm('Supprimer toutes les transactions enregistrées ?')) return;
    setClearing(true);
    await fetch('/api/transactions', { method: 'DELETE' });
    setClearing(false);
    setClearMsg('Transactions supprimées.');
    setTimeout(() => setClearMsg(''), 3000);
  };

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-200">
          <h1 className="text-3xl font-semibold text-slate-900">Importer des transactions</h1>
          <p className="mt-2 text-slate-600 text-sm">
            Les données sont enregistrées localement dans{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5">/data/transactions.json</code>.
            Consultez le <Link href="/aide#exports" className="text-teal-600 underline">guide d&apos;export</Link> si besoin.
          </p>

          {/* Onglets */}
          <div className="mt-6 flex gap-1 rounded-2xl bg-slate-100 p-1 w-fit">
            <button
              type="button"
              onClick={() => setTab('csv')}
              className={`rounded-xl px-5 py-2 text-sm font-medium transition ${
                tab === 'csv'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Via CSV
            </button>
            <button
              type="button"
              onClick={() => setTab('api')}
              className={`rounded-xl px-5 py-2 text-sm font-medium transition ${
                tab === 'api'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Via API (historique complet)
            </button>
          </div>

          <div className="mt-6">
            {tab === 'csv' ? <CsvImport /> : <BrokerApiImport />}
          </div>
        </div>

        <CoingeckoKeySection />

        {/* Effacer */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            disabled={clearing}
            onClick={handleClear}
            className="text-xs text-slate-400 underline hover:text-red-500 disabled:opacity-50"
          >
            Effacer toutes les transactions
          </button>
          {clearMsg && <span className="text-xs text-slate-500">{clearMsg}</span>}
        </div>
      </div>
    </main>
  );
}
