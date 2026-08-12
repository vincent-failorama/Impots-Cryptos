import { test } from "node:test";
import assert from "node:assert/strict";

import { parseCsv, parseCsvWithColumns, buildColumnMap, COLUMN_FIELDS } from "./index";

/**
 * Les libellés attendus par défaut viennent de la documentation des
 * plateformes : un export réel peut les démentir. La correspondance manuelle
 * garantit qu'un fichier reste importable même dans ce cas — c'est le filet
 * qui rend l'application indépendante de l'exactitude de ces suppositions.
 */

// Export fictif dont aucun libellé ne figure dans les alias connus
const CSV_EXOTIQUE = `Horodatage complet,Instrument négocié,Opération effectuée,Nombre d'unités,Contrepartie EUR,Cours unitaire,Ref interne
2023-06-15 10:00:00,BTCEUR,Vente,0.5,12500,25000,ref-1
2023-01-10 09:00:00,BTCEUR,Achat,0.5,10000,20000,ref-2`;

test("un export aux libellés inconnus échoue avec les alias par défaut", () => {
  // Prérequis du scénario : sans correspondance, l'import ne produit rien —
  // et c'est bien un échec visible, pas une donnée fausse.
  assert.deepEqual(parseCsv("binance", CSV_EXOTIQUE), []);
});

test("une correspondance manuelle rend le fichier importable", () => {
  const txs = parseCsvWithColumns(
    "binance",
    CSV_EXOTIQUE,
    buildColumnMap({
      date: "Horodatage complet",
      pair: "Instrument négocié",
      side: "Opération effectuée",
      qty: "Nombre d'unités",
      total: "Contrepartie EUR",
      price: "Cours unitaire",
      id: "Ref interne",
    })
  );

  assert.equal(txs.length, 2);
  assert.deepEqual(txs.map((t) => t.asset), ["BTC", "BTC"]);
  assert.deepEqual(txs.map((t) => t.type), ["sell", "buy"]);
  assert.deepEqual(txs.map((t) => t.isTaxable), [true, false]);
  assert.deepEqual(txs.map((t) => t.id), ["ref-1", "ref-2"]);
  assert.equal(txs[0].fiatAmount, 12500);
  assert.equal(txs[0].qty, 0.5);
});

test("les champs optionnels peuvent rester vides", () => {
  // Sans prix unitaire ni identifiant : le prix se déduit du total et un
  // identifiant est engendré, sans quoi l'import serait bloqué sans raison.
  const txs = parseCsvWithColumns(
    "binance",
    CSV_EXOTIQUE,
    buildColumnMap({
      date: "Horodatage complet",
      pair: "Instrument négocié",
      side: "Opération effectuée",
      qty: "Nombre d'unités",
      total: "Contrepartie EUR",
    })
  );

  assert.equal(txs.length, 2);
  assert.equal(txs[0].priceEur, 25000); // 12500 / 0.5
  assert.ok(txs[0].id.startsWith("binance-"), "un identifiant doit être engendré");
});

test("une correspondance erronée ne produit pas de données fantaisistes", () => {
  // Colonne de date pointée sur un libellé qui n'en contient pas :
  // toutes les lignes sont écartées plutôt qu'importées avec une date fausse.
  const txs = parseCsvWithColumns(
    "binance",
    CSV_EXOTIQUE,
    buildColumnMap({
      date: "Ref interne",
      pair: "Instrument négocié",
      side: "Opération effectuée",
      qty: "Nombre d'unités",
    })
  );

  assert.deepEqual(txs, []);
});

test("la correspondance fonctionne pour n'importe quelle plateforme", () => {
  for (const platform of ["swissborg", "coinhouse", "revolut"] as const) {
    const txs = parseCsvWithColumns(
      platform,
      CSV_EXOTIQUE,
      buildColumnMap({
        date: "Horodatage complet",
        pair: "Instrument négocié",
        side: "Opération effectuée",
        qty: "Nombre d'unités",
        total: "Contrepartie EUR",
      })
    );
    assert.equal(txs.length, 2, `${platform} : correspondance non appliquée`);
    assert.equal(txs[0].platform, platform);
  }
});

test("les champs obligatoires couvrent bien le minimum exploitable", () => {
  const required = COLUMN_FIELDS.filter((f) => f.required).map((f) => f.key);
  assert.deepEqual([...required].sort(), ["date", "pair", "qty", "side"]);
});
