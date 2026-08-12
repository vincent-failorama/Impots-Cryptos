import crypto from "crypto";

/**
 * Authentification Coinbase Developer Platform (CDP).
 *
 * Les clés API « legacy » (signature HMAC-SHA256 via les en-têtes CB-ACCESS-*)
 * ont expiré le 5 février 2025 : toute intégration qui les utilise encore est
 * définitivement rejetée. Coinbase impose désormais un JWT signé, transmis en
 * `Authorization: Bearer`.
 *
 * Deux formats de clé coexistent :
 *   - Ed25519 (recommandé) — le secret est une chaîne base64 de 64 octets dont
 *     les 32 premiers constituent la graine ; algorithme `EdDSA`.
 *   - ECDSA P-256 — le secret est une clé PEM `BEGIN EC PRIVATE KEY` ;
 *     algorithme `ES256`, signature au format IEEE P-1363 (r‖s) et non DER.
 *
 * Le jeton n'est valable que 120 secondes et porte la requête exacte qu'il
 * autorise (méthode, hôte et chemin) : il doit donc être régénéré à chaque appel.
 */

export type CoinbaseKeyAlgorithm = "EdDSA" | "ES256";

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Préfixe PKCS#8 d'une clé privée Ed25519 : seule la graine varie. */
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

/**
 * Détecte le format du secret fourni et construit la clé privée correspondante.
 * @throws si le secret n'est ni un PEM EC ni une graine Ed25519 exploitable.
 */
export function parsePrivateKey(apiSecret: string): {
  key: crypto.KeyObject;
  algorithm: CoinbaseKeyAlgorithm;
} {
  const secret = apiSecret.trim();

  // ── ECDSA : clé au format PEM ────────────────────────────────────────────
  if (secret.includes("BEGIN") && secret.includes("PRIVATE KEY")) {
    // Les clés copiées depuis l'interface contiennent des \n littéraux
    const pem = secret.replace(/\\n/g, "\n");
    return { key: crypto.createPrivateKey(pem), algorithm: "ES256" };
  }

  // ── Ed25519 : secret base64 de 64 octets (graine + clé publique) ─────────
  let raw: Buffer;
  try {
    raw = Buffer.from(secret, "base64");
  } catch {
    throw new Error("Format de clé secrète non reconnu.");
  }

  if (raw.length !== 64 && raw.length !== 32) {
    throw new Error(
      "Format de clé secrète non reconnu. Attendu : une clé Ed25519 (base64) " +
      "ou une clé ECDSA au format PEM, telles que fournies par Coinbase Developer Platform."
    );
  }

  const seed = raw.subarray(0, 32);
  const pkcs8 = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);
  return {
    key: crypto.createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" }),
    algorithm: "EdDSA",
  };
}

/**
 * Construit un JWT d'appel signé, valable 120 secondes.
 *
 * @param keyName   Nom complet de la clé (`organizations/…/apiKeys/…`)
 * @param apiSecret Secret associé, en base64 (Ed25519) ou en PEM (ECDSA)
 * @param method    Méthode HTTP en majuscules
 * @param host      Hôte sans protocole, ex. « api.coinbase.com »
 * @param path      Chemin de la requête, ex. « /api/v3/brokerage/accounts »
 */
export function buildCoinbaseJwt(
  keyName: string,
  apiSecret: string,
  method: string,
  host: string,
  path: string
): string {
  const { key, algorithm } = parsePrivateKey(apiSecret);
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: algorithm,
    typ: "JWT",
    kid: keyName,
    // Le nonce interdit le rejeu d'un jeton intercepté
    nonce: crypto.randomBytes(16).toString("hex"),
  };

  const payload = {
    sub: keyName,
    iss: "cdp",
    nbf: now,
    exp: now + 120,
    // Le jeton n'autorise que cette requête précise
    uri: `${method.toUpperCase()} ${host}${path}`,
    aud: ["cdp_service"],
  };

  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;

  let signature: Buffer;
  if (algorithm === "EdDSA") {
    // Ed25519 signe le message brut, sans pré-hachage
    signature = crypto.sign(null, Buffer.from(signingInput), key);
  } else {
    // JOSE impose la concaténation r‖s, alors que Node produit du DER par défaut
    signature = crypto.sign("sha256", Buffer.from(signingInput), {
      key,
      dsaEncoding: "ieee-p1363",
    });
  }

  return `${signingInput}.${base64Url(signature)}`;
}
