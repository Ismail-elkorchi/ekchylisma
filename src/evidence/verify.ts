import type { EvidenceBundle } from "../core/types.ts";
import { sha256Hex } from "../core/hash.ts";
import {
  EVIDENCE_ATTESTATION_ALGORITHM,
  EVIDENCE_ATTESTATION_CANONICALIZATION,
  EVIDENCE_ATTESTATION_VERSION,
  canonicalizeEvidenceBundle,
  decodeBase64Url,
  importHmacJwkKey,
  stripAttestation,
} from "./common.ts";

const encoder = new TextEncoder();

export type VerifyEvidenceBundleOptions = {
  key: JsonWebKey;
};

export type VerifyEvidenceBundleResult =
  | {
    valid: true;
    keyId: string | null;
    payloadHash: string;
  }
  | {
    valid: false;
    reason:
      | "missing_attestation"
      | "unsupported_attestation_version"
      | "unsupported_canonicalization"
      | "unsupported_algorithm"
      | "payload_hash_mismatch"
      | "invalid_signature";
    keyId: string | null;
    payloadHash: string | null;
  };

export async function verifyEvidenceBundleAttestation(
  bundle: EvidenceBundle,
  options: VerifyEvidenceBundleOptions,
): Promise<VerifyEvidenceBundleResult> {
  const attestation = bundle.attestation;
  if (!attestation) {
    return {
      valid: false,
      reason: "missing_attestation",
      keyId: null,
      payloadHash: null,
    };
  }

  if (attestation.version !== EVIDENCE_ATTESTATION_VERSION) {
    return {
      valid: false,
      reason: "unsupported_attestation_version",
      keyId: attestation.keyId ?? null,
      payloadHash: attestation.payloadHash,
    };
  }

  if (attestation.canonicalization !== EVIDENCE_ATTESTATION_CANONICALIZATION) {
    return {
      valid: false,
      reason: "unsupported_canonicalization",
      keyId: attestation.keyId ?? null,
      payloadHash: attestation.payloadHash,
    };
  }

  if (attestation.algorithm !== EVIDENCE_ATTESTATION_ALGORITHM) {
    return {
      valid: false,
      reason: "unsupported_algorithm",
      keyId: attestation.keyId ?? null,
      payloadHash: attestation.payloadHash,
    };
  }

  const unsignedBundle = stripAttestation(bundle);
  const canonicalPayload = canonicalizeEvidenceBundle(unsignedBundle);
  const payloadHash = await sha256Hex(canonicalPayload);
  if (payloadHash !== attestation.payloadHash) {
    return {
      valid: false,
      reason: "payload_hash_mismatch",
      keyId: attestation.keyId ?? null,
      payloadHash,
    };
  }

  const key = await importHmacJwkKey(options.key, ["verify"]);
  const signature = decodeBase64Url(attestation.signature);
  const valid = await globalThis.crypto.subtle.verify(
    "HMAC",
    key,
    new Uint8Array(signature),
    encoder.encode(canonicalPayload),
  );

  if (!valid) {
    return {
      valid: false,
      reason: "invalid_signature",
      keyId: attestation.keyId ?? null,
      payloadHash,
    };
  }

  return {
    valid: true,
    keyId: attestation.keyId ?? null,
    payloadHash,
  };
}
