import type { EvidenceBundle } from "../core/types.ts";

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_LOOKUP = new Map<string, number>(
  Array.from(BASE64_ALPHABET).map((character, index) => [character, index]),
);

export const EVIDENCE_ATTESTATION_VERSION = "1";
export const EVIDENCE_ATTESTATION_CANONICALIZATION = "ekchylisma-json-c14n-v1";
export const EVIDENCE_ATTESTATION_ALGORITHM = "HMAC-SHA-256";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function canonicalizeJsonValue(value: unknown): string {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new Error("Cannot canonicalize non-finite number values.");
      }
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "object":
      if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalizeJsonValue(item)).join(",")}]`;
      }

      if (!isPlainObject(value)) {
        throw new Error("Cannot canonicalize non-plain-object values.");
      }

      return `{${Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalizeJsonValue(entryValue)}`)
        .join(",")}}`;
    default:
      throw new Error(`Cannot canonicalize value type: ${typeof value}`);
  }
}

export function stripAttestation(bundle: EvidenceBundle): EvidenceBundle {
  if (!bundle.attestation) {
    return bundle;
  }

  const { attestation: _ignored, ...unsignedBundle } = bundle;
  return unsignedBundle;
}

export function canonicalizeEvidenceBundle(bundle: EvidenceBundle): string {
  return canonicalizeJsonValue(stripAttestation(bundle));
}

function encodeBase64(bytes: Uint8Array): string {
  let output = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const c = index + 2 < bytes.length ? bytes[index + 2] : 0;

    const triple = (a << 16) | (b << 8) | c;
    output += BASE64_ALPHABET[(triple >> 18) & 63];
    output += BASE64_ALPHABET[(triple >> 12) & 63];
    output += index + 1 < bytes.length ? BASE64_ALPHABET[(triple >> 6) & 63] : "=";
    output += index + 2 < bytes.length ? BASE64_ALPHABET[triple & 63] : "=";
  }

  return output;
}

function decodeBase64(base64: string): Uint8Array {
  if (base64.length % 4 !== 0) {
    throw new Error("Invalid base64 input length.");
  }

  const bytes: number[] = [];

  for (let index = 0; index < base64.length; index += 4) {
    const c1 = base64[index];
    const c2 = base64[index + 1];
    const c3 = base64[index + 2];
    const c4 = base64[index + 3];

    const v1 = BASE64_LOOKUP.get(c1);
    const v2 = BASE64_LOOKUP.get(c2);
    const v3 = c3 === "=" ? 0 : BASE64_LOOKUP.get(c3);
    const v4 = c4 === "=" ? 0 : BASE64_LOOKUP.get(c4);

    if (v1 === undefined || v2 === undefined || v3 === undefined || v4 === undefined) {
      throw new Error("Invalid base64 character.");
    }

    const triple = (v1 << 18) | (v2 << 12) | (v3 << 6) | v4;
    bytes.push((triple >> 16) & 0xff);

    if (c3 !== "=") {
      bytes.push((triple >> 8) & 0xff);
    }

    if (c4 !== "=") {
      bytes.push(triple & 0xff);
    }
  }

  return Uint8Array.from(bytes);
}

export function encodeBase64Url(bytes: Uint8Array): string {
  return encodeBase64(bytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function decodeBase64Url(input: string): Uint8Array {
  const normalized = input
    .replaceAll("-", "+")
    .replaceAll("_", "/");

  const remainder = normalized.length % 4;
  const padded = remainder === 0 ? normalized : normalized + "=".repeat(4 - remainder);
  return decodeBase64(padded);
}

export async function importHmacJwkKey(
  jwk: JsonWebKey,
  keyUsages: KeyUsage[],
): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("WebCrypto subtle API is required for attestation.");
  }

  if (jwk.kty !== "oct") {
    throw new Error("Attestation key must be a symmetric JWK (kty=oct).");
  }

  return globalThis.crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "HMAC", hash: "SHA-256" },
    false,
    keyUsages,
  );
}
