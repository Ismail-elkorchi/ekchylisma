import type { EvidenceBundle } from "../core/types.ts";
import { sha256Hex } from "../core/hash.ts";
import {
  canonicalizeEvidenceBundle,
  encodeBase64Url,
  EVIDENCE_ATTESTATION_ALGORITHM,
  EVIDENCE_ATTESTATION_CANONICALIZATION,
  EVIDENCE_ATTESTATION_VERSION,
  importHmacJwkKey,
  stripAttestation,
} from "./common.ts";

const encoder = new TextEncoder();

export type AttestEvidenceBundleOptions = {
  key: JsonWebKey;
  keyId?: string;
  signedAt?: string;
};

export async function attestEvidenceBundle(
  bundle: EvidenceBundle,
  options: AttestEvidenceBundleOptions,
): Promise<EvidenceBundle> {
  const unsignedBundle = stripAttestation(bundle);
  const canonicalPayload = canonicalizeEvidenceBundle(unsignedBundle);
  const payloadHash = await sha256Hex(canonicalPayload);

  const key = await importHmacJwkKey(options.key, ["sign"]);
  const signatureBuffer = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(canonicalPayload),
  );
  const signature = encodeBase64Url(new Uint8Array(signatureBuffer));

  return {
    ...unsignedBundle,
    attestation: {
      version: EVIDENCE_ATTESTATION_VERSION,
      canonicalization: EVIDENCE_ATTESTATION_CANONICALIZATION,
      algorithm: EVIDENCE_ATTESTATION_ALGORITHM,
      keyId: options.keyId,
      payloadHash,
      signature,
      signedAt: options.signedAt ?? new Date().toISOString(),
    },
  };
}
