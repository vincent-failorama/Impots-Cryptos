/**
 * Accès centralisé au localStorage.
 *
 * Les clés étaient auparavant écrites en clair dans chaque page : une faute de
 * frappe dans l'une d'elles faisait silencieusement ignorer la donnée, sans
 * erreur visible (une clé CoinGecko non lue divise par trois la vitesse de
 * calcul sans rien signaler). Elles sont désormais déclarées une seule fois.
 *
 * Toutes les fonctions sont sûres côté serveur (rendu SSR) et tolèrent un
 * stockage indisponible — navigation privée, quota dépassé, cookies bloqués.
 */

export const STORAGE_KEYS = {
  /** Clé API CoinGecko saisie par l'utilisateur. */
  coingeckoKey: "crypto-tax-coingecko",
  /** Comptes étrangers du Cerfa 3916-bis. */
  foreignAccounts: "crypto-tax-3916",
  /** Cours historiques déjà résolus (immuables). */
  priceCache: "crypto-tax-price-cache",
  /** Correspondance symbole → identifiant CoinGecko. */
  assetRegistry: "crypto-tax-asset-registry",
  /** Frais déductibles saisis par année fiscale. */
  deductibleFees: "crypto-tax-deductible-fees",
} as const;

/** Clé de stockage des identifiants API, par plateforme. */
export function brokerKeysStorageKey(platform: string): string {
  return `crypto-tax-api-${platform}`;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null; // accès refusé (navigation privée, politique de cookies)
  }
}

export function readString(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    /* quota dépassé : on abandonne silencieusement, ce n'est jamais critique */
  }
}

export function remove(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function readJson<T>(key: string, fallback: T): T {
  const raw = readString(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback; // donnée corrompue : on repart du défaut
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    writeString(key, JSON.stringify(value));
  } catch {
    /* structure non sérialisable */
  }
}

/**
 * Clé API CoinGecko, ou `undefined` si absente.
 * `undefined` (et non `null`) pour s'enchaîner directement avec les fonctions
 * de calcul, dont le paramètre est optionnel.
 */
export function getCoinGeckoKey(): string | undefined {
  return readString(STORAGE_KEYS.coingeckoKey) ?? undefined;
}
