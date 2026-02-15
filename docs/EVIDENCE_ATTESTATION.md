# Evidence Attestation

## Purpose
`attestEvidenceBundle()` and `verifyEvidenceBundleAttestation()` provide optional integrity checks for `EvidenceBundle` payloads.

## Key Format
- JWK is required.
- `kty` must be `oct` (symmetric key).
- Algorithm is fixed to `HMAC-SHA-256`.

Example key generation in Node/Deno/Bun:
```ts
const key = await crypto.subtle.generateKey(
  { name: "HMAC", hash: "SHA-256", length: 256 },
  true,
  ["sign", "verify"],
);
const jwk = await crypto.subtle.exportKey("jwk", key);
```

## Canonicalization Rules
Canonicalization string is `ekchylisma-json-c14n-v1`.

Rules:
- Attestation field is excluded before signing/verifying.
- Object keys are sorted lexicographically at every level.
- Array element order is preserved.
- Values are JSON-encoded deterministically.
- `undefined` object properties are omitted.

## Usage
```ts
import {
  attestEvidenceBundle,
  verifyEvidenceBundleAttestation,
} from "ekchylisma";

const signed = await attestEvidenceBundle(bundle, {
  key: jwk,
  keyId: "key-2026-01",
});

const result = await verifyEvidenceBundleAttestation(signed, { key: jwk });
if (!result.valid) {
  throw new Error(`attestation verify failed: ${result.reason}`);
}
```

## Limits
- Attestation provides integrity and key-possession checks only.
- It does not validate factual correctness of extracted content.
- It does not provide signer identity unless key distribution and trust policy are managed externally.
