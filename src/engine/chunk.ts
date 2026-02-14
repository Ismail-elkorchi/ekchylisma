import { sha256Hex } from "../core/hash.ts";

export type DocumentShard = {
  shardId: string;
  start: number;
  end: number;
  text: string;
};

export type ChunkOptions = {
  chunkSize: number;
  overlap: number;
};

function validateOptions(options: ChunkOptions): void {
  if (!Number.isInteger(options.chunkSize) || options.chunkSize <= 0) {
    throw new Error("chunkSize must be a positive integer.");
  }

  if (!Number.isInteger(options.overlap) || options.overlap < 0) {
    throw new Error("overlap must be a non-negative integer.");
  }

  if (options.overlap >= options.chunkSize) {
    throw new Error("overlap must be smaller than chunkSize.");
  }
}

export async function chunkDocument(
  normalizedText: string,
  programHash: string,
  options: ChunkOptions,
): Promise<DocumentShard[]> {
  validateOptions(options);

  if (normalizedText.length === 0) {
    return [
      {
        shardId: await sha256Hex(`${programHash}`),
        start: 0,
        end: 0,
        text: "",
      },
    ];
  }

  const shards: DocumentShard[] = [];
  const step = options.chunkSize - options.overlap;

  for (let start = 0; start < normalizedText.length; start += step) {
    const end = Math.min(normalizedText.length, start + options.chunkSize);
    const text = normalizedText.slice(start, end);
    const shardId = await sha256Hex(`${programHash}${text}`);

    shards.push({
      shardId,
      start,
      end,
      text,
    });

    if (end === normalizedText.length) {
      break;
    }
  }

  return shards;
}
