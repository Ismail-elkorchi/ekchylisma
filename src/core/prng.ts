export type DeterministicPrng = {
  readonly initialSeed: number;
  nextUint32(): number;
  nextFloat(): number;
  nextInt(maxExclusive: number): number;
  nextRange(minInclusive: number, maxExclusive: number): number;
};

function hashSeedString(input: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash >>> 0;
}

function normalizeSeed(seed: number | string): number {
  if (typeof seed === "number") {
    if (!Number.isFinite(seed)) {
      throw new Error("PRNG seed must be a finite number.");
    }
    return (seed >>> 0) || 0x6d2b79f5;
  }

  if (typeof seed === "string") {
    if (seed.length === 0) {
      throw new Error("PRNG seed string must be non-empty.");
    }
    return hashSeedString(seed) || 0x6d2b79f5;
  }

  throw new Error("PRNG seed must be a number or string.");
}

export function createDeterministicPrng(
  seed: number | string,
): DeterministicPrng {
  const initialSeed = normalizeSeed(seed);
  let state = initialSeed;

  const nextUint32 = (): number => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state >>>= 0;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };

  return {
    initialSeed,
    nextUint32,
    nextFloat: (): number => nextUint32() / 0x1_0000_0000,
    nextInt: (maxExclusive: number): number => {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
        throw new Error("maxExclusive must be a positive integer.");
      }

      return Math.floor((nextUint32() / 0x1_0000_0000) * maxExclusive);
    },
    nextRange: (minInclusive: number, maxExclusive: number): number => {
      if (!Number.isInteger(minInclusive) || !Number.isInteger(maxExclusive)) {
        throw new Error("PRNG range bounds must be integers.");
      }

      if (maxExclusive <= minInclusive) {
        throw new Error("maxExclusive must be greater than minInclusive.");
      }

      return minInclusive +
        Math.floor(
          (nextUint32() / 0x1_0000_0000) * (maxExclusive - minInclusive),
        );
    },
  };
}
