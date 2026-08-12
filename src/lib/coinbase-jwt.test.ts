import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

import { buildCoinbaseJwt, parsePrivateKey } from "./coinbase-jwt";

/**
 * L'API Coinbase n'est pas joignable en test, mais la signature l'est :
 * on génère nos propres paires de clés, on produit un JWT, puis on le vérifie
 * avec la clé publique correspondante. Cela valide l'algorithme, l'encodage et
 * la structure du jeton — reste seulement à la charge de Coinbase d'accepter
 * les claims, dont le format suit leur documentation.
 */

function decodeSegment(segment: string): Record<string, unknown> {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf-8"));
}

function verify(jwt: string, publicKey: crypto.KeyObject, algorithm: "EdDSA" | "ES256"): boolean {
  const [header, payload, signature] = jwt.split(".");
  const signingInput = Buffer.from(`${header}.${payload}`);
  const sig = Buffer.from(signature.replace(/-/g, "+").replace(/_/g, "/"), "base64");

  return algorithm === "EdDSA"
    ? crypto.verify(null, signingInput, publicKey, sig)
    : crypto.verify("sha256", signingInput, { key: publicKey, dsaEncoding: "ieee-p1363" }, sig);
}

const KEY_NAME = "organizations/abc-123/apiKeys/def-456";

// ── Ed25519 (format recommandé) ─────────────────────────────────────────────

function makeEd25519Secret() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const pkcs8 = privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;
  // Les 32 derniers octets du PKCS#8 constituent la graine
  const seed = pkcs8.subarray(pkcs8.length - 32);
  const raw = Buffer.concat([seed, publicKey.export({ format: "der", type: "spki" }).subarray(-32)]);
  return { secret: raw.toString("base64"), publicKey };
}

test("Ed25519 — la signature produite est cryptographiquement valide", () => {
  const { secret, publicKey } = makeEd25519Secret();
  const jwt = buildCoinbaseJwt(KEY_NAME, secret, "GET", "api.coinbase.com", "/api/v3/brokerage/accounts");

  assert.equal(jwt.split(".").length, 3);
  assert.equal(verify(jwt, publicKey, "EdDSA"), true, "signature Ed25519 invalide");
});

test("Ed25519 — l'en-tête déclare EdDSA et le bon identifiant de clé", () => {
  const { secret } = makeEd25519Secret();
  const jwt = buildCoinbaseJwt(KEY_NAME, secret, "GET", "api.coinbase.com", "/api/v3/brokerage/accounts");
  const header = decodeSegment(jwt.split(".")[0]);

  assert.equal(header.alg, "EdDSA");
  assert.equal(header.typ, "JWT");
  assert.equal(header.kid, KEY_NAME);
  assert.equal(typeof header.nonce, "string");
});

test("le nonce diffère à chaque génération", () => {
  const { secret } = makeEd25519Secret();
  const a = decodeSegment(buildCoinbaseJwt(KEY_NAME, secret, "GET", "h", "/p").split(".")[0]);
  const b = decodeSegment(buildCoinbaseJwt(KEY_NAME, secret, "GET", "h", "/p").split(".")[0]);
  assert.notEqual(a.nonce, b.nonce, "un nonce constant autoriserait le rejeu");
});

// ── Claims ──────────────────────────────────────────────────────────────────

test("les claims suivent la spécification CDP", () => {
  const { secret } = makeEd25519Secret();
  const jwt = buildCoinbaseJwt(KEY_NAME, secret, "get", "api.coinbase.com", "/api/v3/brokerage/orders/historical/fills");
  const payload = decodeSegment(jwt.split(".")[1]) as Record<string, string | number | string[]>;

  assert.equal(payload.sub, KEY_NAME);
  assert.equal(payload.iss, "cdp");
  assert.deepEqual(payload.aud, ["cdp_service"]);
  // La méthode est normalisée en majuscules, l'hôte et le chemin concaténés
  assert.equal(payload.uri, "GET api.coinbase.com/api/v3/brokerage/orders/historical/fills");
});

test("le jeton expire au bout de 120 secondes", () => {
  const { secret } = makeEd25519Secret();
  const payload = decodeSegment(
    buildCoinbaseJwt(KEY_NAME, secret, "GET", "h", "/p").split(".")[1]
  ) as { nbf: number; exp: number };

  assert.equal(payload.exp - payload.nbf, 120);
  const now = Math.floor(Date.now() / 1000);
  assert.ok(Math.abs(payload.nbf - now) <= 2, "nbf doit refléter l'instant courant");
});

test("le jeton n'autorise que la requête qu'il décrit", () => {
  const { secret } = makeEd25519Secret();
  const lecture = decodeSegment(buildCoinbaseJwt(KEY_NAME, secret, "GET", "api.coinbase.com", "/a").split(".")[1]);
  const ecriture = decodeSegment(buildCoinbaseJwt(KEY_NAME, secret, "POST", "api.coinbase.com", "/b").split(".")[1]);
  assert.notEqual(lecture.uri, ecriture.uri);
});

// ── ECDSA (format hérité, toujours accepté) ─────────────────────────────────

test("ECDSA — une clé PEM produit une signature ES256 valide", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = privateKey.export({ format: "pem", type: "sec1" }) as string;

  const jwt = buildCoinbaseJwt(KEY_NAME, pem, "GET", "api.coinbase.com", "/api/v3/brokerage/accounts");
  const header = decodeSegment(jwt.split(".")[0]);

  assert.equal(header.alg, "ES256");
  assert.equal(verify(jwt, publicKey, "ES256"), true, "signature ES256 invalide");
});

test("ECDSA — les retours à la ligne échappés sont tolérés", () => {
  // Une clé copiée depuis un JSON contient des \n littéraux
  const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = (privateKey.export({ format: "pem", type: "sec1" }) as string).replace(/\n/g, "\\n");

  assert.doesNotThrow(() => parsePrivateKey(pem));
  assert.equal(parsePrivateKey(pem).algorithm, "ES256");
});

// ── Robustesse ──────────────────────────────────────────────────────────────

test("un secret inexploitable échoue avec un message explicite", () => {
  assert.throws(
    () => parsePrivateKey("pas-une-cle"),
    /Format de clé secrète non reconnu/,
    "l'erreur doit orienter l'utilisateur, pas produire un 401 opaque"
  );
});

test("une signature ne valide pas une charge utile modifiée", () => {
  const { secret, publicKey } = makeEd25519Secret();
  const jwt = buildCoinbaseJwt(KEY_NAME, secret, "GET", "api.coinbase.com", "/api/v3/brokerage/accounts");
  const [header, , signature] = jwt.split(".");

  const falsifie = Buffer.from(JSON.stringify({ sub: "attaquant", iss: "cdp" }))
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  assert.equal(verify(`${header}.${falsifie}.${signature}`, publicKey, "EdDSA"), false);
});
