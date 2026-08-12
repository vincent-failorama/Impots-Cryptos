import { test } from "node:test";
import assert from "node:assert/strict";

import { computeYearSummary, EXEMPTION_THRESHOLD_EUR, PFU, CessionResult } from "./calculator";

const cession = (o: Partial<CessionResult>): CessionResult => ({
  id: Math.random().toString(36).slice(2),
  date: new Date("2023-06-15"),
  platform: "binance",
  asset: "BTC",
  qty: 1,
  grossProceeds: 0,
  acquisitionCost: 0,
  gainLoss: 0,
  taxableAmount: 0,
  isTaxable: true,
  portfolioValueAtSale: 0,
  globalCostBasisBefore: 0,
  portfolioValueCertain: true,
  ...o,
});

// ── Seuil d'exonération (art. 150 VH bis) ───────────────────────────────────

test("sous 305 € de cessions cumulées, la plus-value est exonérée", () => {
  const s = computeYearSummary(2023, [
    cession({ grossProceeds: 200, gainLoss: 150 }),
    cession({ grossProceeds: 100, gainLoss: 80 }),
  ]);

  assert.equal(s.totalProceeds, 300);
  assert.equal(s.isExempt, true);
  assert.equal(s.taxableBase, 0);
  assert.equal(s.totalTax, 0);
  // La plus-value reste affichée : seule l'imposition disparaît
  assert.equal(s.case3AN, 230);
});

test("le seuil porte sur le total cédé, pas sur le gain", () => {
  // 10 000 € cédés pour seulement 50 € de gain : imposable malgré un petit gain
  const s = computeYearSummary(2023, [cession({ grossProceeds: 10000, gainLoss: 50 })]);
  assert.equal(s.isExempt, false);
  assert.equal(s.taxableBase, 50);
});

test("le seuil est inclusif : 305 € exactement reste exonéré", () => {
  const s = computeYearSummary(2023, [
    cession({ grossProceeds: EXEMPTION_THRESHOLD_EUR, gainLoss: 100 }),
  ]);
  assert.equal(s.isExempt, true);

  const juste = computeYearSummary(2023, [
    cession({ grossProceeds: EXEMPTION_THRESHOLD_EUR + 0.01, gainLoss: 100 }),
  ]);
  assert.equal(juste.isExempt, false);
});

// ── Impôt (PFU) ─────────────────────────────────────────────────────────────

test("le PFU se décompose en 12,8 % d'IR et 17,2 % de prélèvements sociaux", () => {
  const s = computeYearSummary(2023, [cession({ grossProceeds: 12500, gainLoss: 10000 })]);

  assert.equal(s.taxableBase, 10000);
  assert.equal(Math.round(s.incomeTax), 1280);
  assert.equal(Math.round(s.socialCharges), 1720);
  assert.equal(Math.round(s.totalTax), 3000);
  assert.equal(PFU.incomeTaxRate + PFU.socialChargesRate, 0.3);
});

test("une moins-value ne produit aucun impôt", () => {
  const s = computeYearSummary(2023, [cession({ grossProceeds: 8000, gainLoss: -2000 })]);

  assert.equal(s.case3AN, 0);
  assert.equal(s.case3BN, 2000);
  assert.equal(s.taxableBase, 0);
  assert.equal(s.totalTax, 0);
});

test("gains et pertes se compensent au sein de la même année", () => {
  // Les moins-values sur actifs numériques ne se reportent pas d'une année sur
  // l'autre : elles s'imputent uniquement sur les gains du même exercice.
  const s = computeYearSummary(2023, [
    cession({ grossProceeds: 12500, gainLoss: 5000 }),
    cession({ grossProceeds: 8000, gainLoss: -2000 }),
  ]);

  assert.equal(s.netGain, 3000);
  assert.equal(s.taxableBase, 3000);
  assert.equal(Math.round(s.totalTax), 900);
});

// ── Frais déductibles ───────────────────────────────────────────────────────

test("les frais réduisent l'assiette imposable", () => {
  const s = computeYearSummary(2023, [cession({ grossProceeds: 12500, gainLoss: 10000 })], 1000);

  assert.equal(s.deductibleFees, 1000);
  assert.equal(s.adjustedGain, 9000);
  assert.equal(s.taxableBase, 9000);
  assert.equal(Math.round(s.totalTax), 2700);
});

test("des frais supérieurs au gain basculent l'année en moins-value", () => {
  const s = computeYearSummary(2023, [cession({ grossProceeds: 12500, gainLoss: 500 })], 900);

  assert.equal(s.adjustedGain, -400);
  assert.equal(s.case3AN, 0);
  assert.equal(s.case3BN, 400);
  assert.equal(s.taxableBase, 0);
});

test("les frais ne font pas entrer une année exonérée dans l'imposition", () => {
  const s = computeYearSummary(2023, [cession({ grossProceeds: 200, gainLoss: 150 })], 50);
  assert.equal(s.isExempt, true);
  assert.equal(s.totalTax, 0);
});

// ── Divers ──────────────────────────────────────────────────────────────────

test("une année sans cession ne produit ni assiette ni impôt", () => {
  const s = computeYearSummary(2023, []);
  assert.equal(s.cessionCount, 0);
  assert.equal(s.totalProceeds, 0);
  assert.equal(s.isExempt, true);
  assert.equal(s.totalTax, 0);
});

test("l'incertitude de valorisation est remontée au niveau de l'année", () => {
  const s = computeYearSummary(2023, [
    cession({ grossProceeds: 5000, gainLoss: 1000, portfolioValueCertain: true }),
    cession({ grossProceeds: 5000, gainLoss: 1000, portfolioValueCertain: false }),
  ]);
  assert.equal(s.hasUncertainValuation, true);
});
