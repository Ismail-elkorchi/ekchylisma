const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("WebCrypto subtle API is required.");
  }

  const data = typeof input === "string" ? encoder.encode(input) : input;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(digest));
}
