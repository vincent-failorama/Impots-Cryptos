import { test } from "node:test";
import assert from "node:assert/strict";

import { API_PLATFORMS, PLATFORMS, PLATFORM_IDS, getPlatform, isPlatformId } from "./platforms";
import { CSV_PARSERS } from "./parsers";
import { API_QUOTE_ASSETS, QUOTE_CURRENCIES, QUOTE_CURRENCIES_BY_LENGTH } from "./quote-currencies";
import { STORAGE_KEYS } from "./storage";
import { coinGeckoThrottleMs, COINGECKO } from "./rate-limits";

// Ces tests verrouillent les invariants du registre : ils échouent si une
// plateforme est ajoutée sans son parser, sans guide, ou avec un id en double.

test("chaque plateforme possède un parser CSV", () => {
  for (const platform of PLATFORMS) {
    assert.equal(
      typeof CSV_PARSERS[platform.id],
      "function",
      `parser CSV manquant pour « ${platform.id} »`
    );
  }
});

test("aucun parser orphelin", () => {
  for (const id of Object.keys(CSV_PARSERS)) {
    assert.ok(PLATFORM_IDS.includes(id as never), `parser sans plateforme : « ${id} »`);
  }
});

test("toute plateforme est soit déclarative, soit dotée d'un parser dédié", () => {
  // Le parser générique se construit depuis `csvColumns` : sans lui, la
  // plateforme doit avoir un parser écrit à la main, sinon l'import serait vide.
  const DEDICATED: readonly string[] = ["coinbase", "kucoin"];
  for (const platform of PLATFORMS) {
    const declarative = platform.csvColumns !== undefined;
    const dedicated = DEDICATED.includes(platform.id);
    assert.ok(
      declarative || dedicated,
      `« ${platform.id} » n'a ni csvColumns ni parser dédié`
    );
  }
});

test("chaque csvColumns décrit tous les champs nécessaires", () => {
  const REQUIRED = ["date", "pair", "side", "qty", "total", "price", "id"] as const;
  for (const platform of PLATFORMS) {
    if (!platform.csvColumns) continue;
    for (const field of REQUIRED) {
      const aliases = platform.csvColumns[field];
      assert.ok(
        Array.isArray(aliases) && aliases.length > 0,
        `${platform.id} : aucun alias pour « ${field} »`
      );
    }
  }
});

test("les identifiants de plateforme sont uniques", () => {
  assert.equal(new Set(PLATFORM_IDS).size, PLATFORM_IDS.length);
});

test("chaque plateforme fournit un libellé et un guide d'export", () => {
  for (const platform of PLATFORMS) {
    assert.ok(platform.label.length > 0, `libellé manquant : ${platform.id}`);
    assert.ok(
      platform.csvExportSteps.length > 0,
      `guide d'export CSV manquant : ${platform.id}`
    );
  }
});

test("toute plateforme avec API décrit sa configuration de sécurité", () => {
  for (const platform of API_PLATFORMS) {
    assert.ok(platform.api.securityNote.length > 0, `note de sécurité manquante : ${platform.id}`);
    assert.ok(platform.api.keyCreationPath.length > 0, `chemin de création manquant : ${platform.id}`);
    assert.ok(platform.api.requiredPermission.length > 0, `permission manquante : ${platform.id}`);
  }
});

test("API_PLATFORMS est bien un sous-ensemble de PLATFORMS", () => {
  for (const platform of API_PLATFORMS) {
    assert.ok(PLATFORM_IDS.includes(platform.id));
  }
  // Bitget n'expose pas d'import API dans cette application
  assert.ok(!API_PLATFORMS.some((p) => p.id === "bitget"));
});

test("isPlatformId rejette les entrées non fiables", () => {
  assert.equal(isPlatformId("binance"), true);
  assert.equal(isPlatformId("HACK"), false);
  assert.equal(isPlatformId(""), false);
  assert.equal(isPlatformId(null), false);
  assert.equal(isPlatformId(42), false);
});

test("getPlatform retourne l'entrée correspondante", () => {
  assert.equal(getPlatform("kraken").label, "Kraken");
  assert.equal(getPlatform("gate").label, "Gate.io");
});

// ── Devises de cotation ─────────────────────────────────────────────────────

test("les devises interrogées par API font partie de la liste canonique", () => {
  for (const quote of API_QUOTE_ASSETS) {
    assert.ok(
      (QUOTE_CURRENCIES as readonly string[]).includes(quote),
      `devise API hors référentiel : ${quote}`
    );
  }
});

test("le tri par longueur décroissante est respecté", () => {
  // Garantit que "USDT" est testé avant "USD" lors du découpage des paires
  for (let i = 1; i < QUOTE_CURRENCIES_BY_LENGTH.length; i++) {
    assert.ok(
      QUOTE_CURRENCIES_BY_LENGTH[i - 1].length >= QUOTE_CURRENCIES_BY_LENGTH[i].length
    );
  }
});

// ── Constantes centralisées ─────────────────────────────────────────────────

test("les clés de stockage sont uniques et préfixées", () => {
  const keys = Object.values(STORAGE_KEYS);
  assert.equal(new Set(keys).size, keys.length, "clé de stockage en double");
  for (const key of keys) {
    assert.ok(key.startsWith("crypto-tax-"), `préfixe manquant : ${key}`);
  }
});

test("la temporisation CoinGecko dépend de la présence d'une clé", () => {
  assert.equal(coinGeckoThrottleMs(undefined), COINGECKO.throttleMsAnonymous);
  assert.equal(coinGeckoThrottleMs("CG-abc"), COINGECKO.throttleMsWithKey);
  assert.ok(
    COINGECKO.throttleMsWithKey < COINGECKO.throttleMsAnonymous,
    "une clé doit accélérer les requêtes"
  );
});
