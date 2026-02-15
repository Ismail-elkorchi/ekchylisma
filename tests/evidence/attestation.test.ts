import type { EvidenceBundle } from "../../src/core/types.ts";
import { attestEvidenceBundle } from "../../src/evidence/attest.ts";
import { verifyEvidenceBundleAttestation } from "../../src/evidence/verify.ts";
import { assert, assertEqual, test } from "../harness.ts";

const FIXED_SIGNED_AT = "2026-02-15T00:00:00.000Z";

async function generateHmacJwk(kid: string): Promise<JsonWebKey> {
  const key = await globalThis.crypto.subtle.generateKey(
    {
      name: "HMAC",
      hash: "SHA-256",
      length: 256,
    },
    true,
    ["sign", "verify"],
  );

  const jwk = await globalThis.crypto.subtle.exportKey("jwk", key);
  jwk.kid = kid;
  return jwk;
}

function buildSampleBundle(): EvidenceBundle {
  return {
    bundleVersion: "1",
    runId: "run-attestation",
    program: {
      instructions: "Extract token mentions.",
      examples: [],
      schema: {
        type: "object",
        properties: {
          class: { type: "string" },
        },
        required: ["class"],
        additionalProperties: false,
      },
      programHash: "program-hash-001",
    },
    extractions: [
      {
        extractionClass: "token",
        quote: "Beta",
        span: {
          offsetMode: "utf16_code_unit",
          charStart: 6,
          charEnd: 10,
        },
        attributes: {
          confidence: 1,
          tags: ["entity", "token"],
        },
        grounding: "explicit",
      },
    ],
    provenance: {
      documentId: "doc-1",
      textHash: "text-hash-001",
      runtime: {
        name: "node",
        version: "runtime-version",
      },
      createdAt: "2026-02-15T00:00:00.000Z",
      programHash: "program-hash-001",
    },
    normalizationLedger: {
      steps: [
        {
          step: "normalizeNewlines",
          mappingStrategy: "not_reversible",
          lossy: false,
          beforeLength: 16,
          afterLength: 16,
        },
      ],
    },
    shardPlan: {
      chunkSize: 512,
      overlap: 0,
      shardCount: 1,
    },
    diagnostics: {
      emptyResultKind: "non_empty",
      shardOutcomes: [],
      failures: [],
      checkpointHits: 0,
      promptLog: {
        programHash: "program-hash-001",
        shardPromptHashes: [],
      },
    },
  };
}

function buildReorderedBundle(source: EvidenceBundle): EvidenceBundle {
  return {
    diagnostics: {
      checkpointHits: source.diagnostics.checkpointHits,
      promptLog: source.diagnostics.promptLog,
      failures: source.diagnostics.failures,
      shardOutcomes: source.diagnostics.shardOutcomes,
      emptyResultKind: source.diagnostics.emptyResultKind,
    },
    shardPlan: {
      shardCount: source.shardPlan.shardCount,
      overlap: source.shardPlan.overlap,
      chunkSize: source.shardPlan.chunkSize,
    },
    normalizationLedger: {
      steps: source.normalizationLedger.steps,
    },
    provenance: {
      programHash: source.provenance.programHash,
      createdAt: source.provenance.createdAt,
      runtime: {
        version: source.provenance.runtime.version,
        name: source.provenance.runtime.name,
      },
      textHash: source.provenance.textHash,
      documentId: source.provenance.documentId,
    },
    extractions: source.extractions.map((entry) => ({
      grounding: entry.grounding,
      attributes: {
        tags: ["entity", "token"],
        confidence: 1,
      },
      span: {
        charEnd: entry.span.charEnd,
        charStart: entry.span.charStart,
        offsetMode: entry.span.offsetMode,
      },
      quote: entry.quote,
      extractionClass: entry.extractionClass,
    })),
    program: {
      programHash: source.program.programHash,
      schema: {
        additionalProperties: false,
        required: ["class"],
        properties: {
          class: { type: "string" },
        },
        type: "object",
      },
      examples: source.program.examples,
      instructions: source.program.instructions,
    },
    runId: source.runId,
    bundleVersion: source.bundleVersion,
  };
}

test("attestEvidenceBundle produces verifiable attestation", async () => {
  const key = await generateHmacJwk("key-primary");
  const signedBundle = await attestEvidenceBundle(buildSampleBundle(), {
    key,
    signedAt: FIXED_SIGNED_AT,
  });

  assert(signedBundle.attestation !== undefined, "attestation should be present");
  if (!signedBundle.attestation) {
    return;
  }

  assertEqual(signedBundle.attestation.version, "1");
  assertEqual(signedBundle.attestation.algorithm, "HMAC-SHA-256");
  assertEqual(signedBundle.attestation.canonicalization, "ekchylisma-json-c14n-v1");
  assertEqual(signedBundle.attestation.signedAt, FIXED_SIGNED_AT);

  const verification = await verifyEvidenceBundleAttestation(signedBundle, { key });
  assertEqual(verification.valid, true, "signed bundle should verify");
});

test("verifyEvidenceBundleAttestation detects payload tampering", async () => {
  const key = await generateHmacJwk("key-primary");
  const signedBundle = await attestEvidenceBundle(buildSampleBundle(), {
    key,
    signedAt: FIXED_SIGNED_AT,
  });

  const tamperedBundle: EvidenceBundle = {
    ...signedBundle,
    runId: `${signedBundle.runId}-tampered`,
  };

  const verification = await verifyEvidenceBundleAttestation(tamperedBundle, { key });
  assertEqual(verification.valid, false, "tampered bundle should fail verification");

  if (verification.valid) {
    throw new Error("expected invalid verification result");
  }

  assertEqual(verification.reason, "payload_hash_mismatch");
});

test("verifyEvidenceBundleAttestation rejects signature from wrong key", async () => {
  const primaryKey = await generateHmacJwk("key-primary");
  const wrongKey = await generateHmacJwk("key-wrong");

  const signedBundle = await attestEvidenceBundle(buildSampleBundle(), {
    key: primaryKey,
    signedAt: FIXED_SIGNED_AT,
  });

  const verification = await verifyEvidenceBundleAttestation(signedBundle, { key: wrongKey });
  assertEqual(verification.valid, false, "verification should fail with wrong key");

  if (verification.valid) {
    throw new Error("expected invalid verification result");
  }

  assertEqual(verification.reason, "invalid_signature");
});

test("attestation canonicalization is stable across object key order", async () => {
  const key = await generateHmacJwk("key-primary");
  const originalBundle = buildSampleBundle();
  const reorderedBundle = buildReorderedBundle(originalBundle);

  const signedOriginal = await attestEvidenceBundle(originalBundle, {
    key,
    keyId: "stable-key",
    signedAt: FIXED_SIGNED_AT,
  });
  const signedReordered = await attestEvidenceBundle(reorderedBundle, {
    key,
    keyId: "stable-key",
    signedAt: FIXED_SIGNED_AT,
  });

  if (!signedOriginal.attestation || !signedReordered.attestation) {
    throw new Error("attestation missing in canonicalization test");
  }

  assertEqual(
    signedOriginal.attestation.payloadHash,
    signedReordered.attestation.payloadHash,
    "payload hashes should match for semantically equivalent bundles",
  );
  assertEqual(
    signedOriginal.attestation.signature,
    signedReordered.attestation.signature,
    "signatures should match for semantically equivalent bundles",
  );
});
