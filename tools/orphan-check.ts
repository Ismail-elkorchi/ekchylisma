import { readdir, readFile, stat } from "node:fs/promises";

const REQUIRED_DOCS = [
  "docs/SPEC.md",
  "docs/API.md",
  "docs/ARCHITECTURE.md",
  "docs/DECISIONS.md",
];

async function ensureFile(path: string): Promise<void> {
  const fileStat = await stat(path);
  if (!fileStat.isFile()) {
    throw new Error(`${path} is not a regular file.`);
  }
}

async function run(): Promise<void> {
  for (const path of REQUIRED_DOCS) {
    await ensureFile(path);
  }

  const apiDoc = await readFile("docs/API.md", "utf8");
  const contractFiles = (await readdir("contracts"))
    .filter((entry) => entry.endsWith(".schema.json"))
    .sort();

  if (contractFiles.length === 0) {
    throw new Error("No contract schemas found in contracts/.");
  }

  const missingReferences = contractFiles.filter(
    (file) => !apiDoc.includes(`contracts/${file}`),
  );

  if (missingReferences.length > 0) {
    throw new Error(
      `Unreferenced contract schema(s): ${missingReferences.join(", ")}. Add them to docs/API.md.`,
    );
  }

  console.log(`orphan-check passed (${contractFiles.length} contracts referenced).`);
}

run().catch((error) => {
  console.error(`orphan-check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
