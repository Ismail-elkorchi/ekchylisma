import { readFile, writeFile } from "node:fs/promises";
import type { EvidenceBundle } from "../core/types.ts";
import {
  decodeJsonlToEvidenceBundles,
  encodeEvidenceBundlesToJsonl,
} from "../io/jsonl.ts";

export async function readEvidenceBundlesFromJsonlFile(
  path: string,
): Promise<EvidenceBundle[]> {
  const content = await readFile(path, "utf8");
  const bundles: EvidenceBundle[] = [];

  for await (const bundle of decodeJsonlToEvidenceBundles(content)) {
    bundles.push(bundle);
  }

  return bundles;
}

export async function writeEvidenceBundlesToJsonlFile(
  path: string,
  bundles: EvidenceBundle[],
): Promise<void> {
  const encoded = encodeEvidenceBundlesToJsonl(bundles);
  await writeFile(path, encoded, "utf8");
}

export async function writeTextFile(
  path: string,
  content: string,
): Promise<void> {
  await writeFile(path, content, "utf8");
}
