import { sha256Hex } from "../../src/core/hash.ts";
import { assert, assertEqual, test } from "../harness.ts";

test("sha256Hex returns known vectors", async () => {
  const vectors = [
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    [
      "The quick brown fox jumps over the lazy dog",
      "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
    ],
    ["🙂", "d06f1525f791397809f9bc98682b5c13318eca4c3123433467fd4dffda44fd14"],
    ["a".repeat(1024 * 1024), "9bc1b2a288b26af7257a36277ae3816a7d4f16e89c1e7e77d0a5c48bad62b360"],
  ] as const;

  for (const [input, expected] of vectors) {
    assertEqual(await sha256Hex(input), expected, `digest mismatch for ${JSON.stringify(input.slice(0, 20))}`);
  }
});

test("sha256Hex is deterministic and returns lowercase 64-char hex", async () => {
  const input = "determinism-check";
  const first = await sha256Hex(input);

  for (let index = 0; index < 20; index += 1) {
    assertEqual(await sha256Hex(input), first, "digest must stay stable");
  }

  assertEqual(first.length, 64, "sha256 hex length");
  assert(/^[0-9a-f]{64}$/.test(first), "sha256 should be lowercase hex");
});
