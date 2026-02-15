import { assertQuoteInvariant, QuoteInvariantViolation } from "../../src/core/invariants.ts";
import { createDeterministicPrng } from "../../src/core/prng.ts";
import { sha256Hex } from "../../src/core/hash.ts";
import { chunkDocument } from "../../src/engine/chunk.ts";
import { mapShardSpanToDocument } from "../../src/engine/mapSpan.ts";
import { assert, assertEqual, test } from "../harness.ts";

const PROPERTY_SEEDS = [
  "property-core-invariants-seed-01",
  "property-core-invariants-seed-02",
  "property-core-invariants-seed-03",
] as const;

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789    ";

function randomText(prng: ReturnType<typeof createDeterministicPrng>, minLength: number, maxLength: number): string {
  const length = prng.nextRange(minLength, maxLength + 1);
  let output = "";

  for (let index = 0; index < length; index += 1) {
    output += ALPHABET[prng.nextInt(ALPHABET.length)];
  }

  return output;
}

test("deterministic PRNG emits stable sequence for identical seeds", () => {
  for (const seed of PROPERTY_SEEDS) {
    const left = createDeterministicPrng(seed);
    const right = createDeterministicPrng(seed);

    for (let index = 0; index < 256; index += 1) {
      assertEqual(left.nextUint32(), right.nextUint32(), "same seed should produce identical sequence");
    }
  }
});

test("property: sha256Hex determinism holds across seeded generated corpus", async () => {
  for (const seed of PROPERTY_SEEDS) {
    const prng = createDeterministicPrng(seed);

    for (let index = 0; index < 64; index += 1) {
      const input = randomText(prng, 1, 96);
      const first = await sha256Hex(input);
      const second = await sha256Hex(input);
      assertEqual(first, second, "digest must be stable for generated input");
    }
  }
});

test("property: chunkDocument shard identifiers remain stable on seeded inputs", async () => {
  for (const seed of PROPERTY_SEEDS) {
    const prng = createDeterministicPrng(seed);

    for (let index = 0; index < 40; index += 1) {
      const text = randomText(prng, 64, 256);
      const documentId = `doc-${prng.nextUint32().toString(16)}`;
      const chunkSize = prng.nextRange(24, 72);
      const overlap = prng.nextInt(Math.max(1, Math.floor(chunkSize / 3)));
      const options = {
        documentId,
        chunkSize,
        overlap,
        offsetMode: "utf16_code_unit" as const,
      };

      const first = await chunkDocument(text, "program-hash-prop", options);
      const second = await chunkDocument(text, "program-hash-prop", options);

      assertEqual(JSON.stringify(first), JSON.stringify(second), "chunking output should be deterministic");
    }
  }
});

test("property: quote invariant stays stable for generated valid and invalid spans", () => {
  for (const seed of PROPERTY_SEEDS) {
    const prng = createDeterministicPrng(seed);

    for (let index = 0; index < 80; index += 1) {
      const documentText = randomText(prng, 32, 192);
      const charStart = prng.nextInt(documentText.length - 1);
      const charEnd = prng.nextRange(charStart + 1, documentText.length + 1);
      const quote = documentText.slice(charStart, charEnd);

      const validExtraction = {
        extractionClass: "token",
        quote,
        offsetMode: "utf16_code_unit" as const,
        charStart,
        charEnd,
        span: {
          offsetMode: "utf16_code_unit" as const,
          charStart,
          charEnd,
        },
        grounding: "explicit" as const,
      };

      assertQuoteInvariant(documentText, validExtraction);

      let threw = false;
      try {
        assertQuoteInvariant(documentText, {
          ...validExtraction,
          quote: `${quote}x`,
        });
      } catch (error) {
        threw = error instanceof QuoteInvariantViolation;
      }
      assert(threw, "modified quote should violate invariant");
    }
  }
});

test("property: mapShardSpanToDocument remains stable for generated shard spans", async () => {
  for (const seed of PROPERTY_SEEDS) {
    const prng = createDeterministicPrng(seed);

    for (let index = 0; index < 48; index += 1) {
      const documentText = randomText(prng, 80, 260);
      const chunkSize = prng.nextRange(20, 60);
      const overlap = prng.nextInt(Math.max(1, Math.floor(chunkSize / 4)));
      const shards = await chunkDocument(documentText, "program-hash-span-property", {
        documentId: `span-doc-${prng.nextUint32().toString(16)}`,
        chunkSize,
        overlap,
        offsetMode: "utf16_code_unit",
      });

      const shard = shards[prng.nextInt(shards.length)];
      const localStart = prng.nextInt(Math.max(1, shard.text.length));
      const localEnd = prng.nextRange(localStart, shard.text.length + 1);
      const localSpan = {
        offsetMode: "utf16_code_unit" as const,
        charStart: localStart,
        charEnd: localEnd,
      };

      const mapped = mapShardSpanToDocument(shard, localSpan);
      assertEqual(
        documentText.slice(mapped.charStart, mapped.charEnd),
        shard.text.slice(localStart, localEnd),
        "mapped span should target identical text",
      );

      const mappedAgain = mapShardSpanToDocument(shard, localSpan);
      assertEqual(JSON.stringify(mapped), JSON.stringify(mappedAgain), "span mapping should be deterministic");
    }
  }
});
