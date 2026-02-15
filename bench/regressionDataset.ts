import { readFile } from "node:fs/promises";

export type RegressionExpected = {
  emptyResultKind: "non_empty" | "empty_by_evidence" | "empty_by_failure";
  minExtractions: number;
  maxExtractions: number;
};

export type RegressionDatasetCase = {
  caseId: string;
  category: string;
  documentText: string;
  instructions: string;
  targetSchema: Record<string, unknown>;
  providerResponseText: string;
  expected: RegressionExpected;
  sourceUrl: string;
  packId: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function parseJsonl(source: string): unknown[] {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`invalid JSON at line ${index + 1}`);
      }
    });
}

export function validateRegressionDatasetRecords(records: unknown[]): RegressionDatasetCase[] {
  const requiredFields = [
    "caseId",
    "category",
    "documentText",
    "instructions",
    "targetSchema",
    "providerResponseText",
    "expected",
    "sourceUrl",
    "packId",
  ];
  const requiredFieldSet = new Set(requiredFields);
  const expectedFields = ["emptyResultKind", "minExtractions", "maxExtractions"];
  const expectedFieldSet = new Set(expectedFields);
  const validKinds = new Set(["non_empty", "empty_by_evidence", "empty_by_failure"]);
  const caseIds = new Set<string>();

  return records.map((record, index) => {
    const line = index + 1;
    if (!isPlainObject(record)) {
      throw new Error(`line ${line}: record must be an object`);
    }

    for (const key of requiredFields) {
      if (!(key in record)) {
        throw new Error(`line ${line}: missing required field ${key}`);
      }
    }

    for (const key of Object.keys(record)) {
      if (!requiredFieldSet.has(key)) {
        throw new Error(`line ${line}: unknown field ${key}`);
      }
    }

    if (typeof record.caseId !== "string" || record.caseId.length === 0) {
      throw new Error(`line ${line}: caseId must be a non-empty string`);
    }
    if (caseIds.has(record.caseId)) {
      throw new Error(`line ${line}: duplicate caseId ${record.caseId}`);
    }
    caseIds.add(record.caseId);

    if (typeof record.category !== "string" || record.category.length === 0) {
      throw new Error(`line ${line}: category must be a non-empty string`);
    }
    if (typeof record.documentText !== "string") {
      throw new Error(`line ${line}: documentText must be a string`);
    }
    if (typeof record.instructions !== "string") {
      throw new Error(`line ${line}: instructions must be a string`);
    }
    if (!isPlainObject(record.targetSchema)) {
      throw new Error(`line ${line}: targetSchema must be an object`);
    }
    if (typeof record.providerResponseText !== "string") {
      throw new Error(`line ${line}: providerResponseText must be a string`);
    }
    if (typeof record.sourceUrl !== "string" || !isUrl(record.sourceUrl)) {
      throw new Error(`line ${line}: sourceUrl must be a valid URL`);
    }
    if (typeof record.packId !== "string" || record.packId.length === 0) {
      throw new Error(`line ${line}: packId must be a non-empty string`);
    }

    if (!isPlainObject(record.expected)) {
      throw new Error(`line ${line}: expected must be an object`);
    }

    for (const key of expectedFields) {
      if (!(key in record.expected)) {
        throw new Error(`line ${line}: expected missing required field ${key}`);
      }
    }
    for (const key of Object.keys(record.expected)) {
      if (!expectedFieldSet.has(key)) {
        throw new Error(`line ${line}: expected has unknown field ${key}`);
      }
    }

    if (
      typeof record.expected.emptyResultKind !== "string" ||
      !validKinds.has(record.expected.emptyResultKind)
    ) {
      throw new Error(`line ${line}: expected.emptyResultKind is invalid`);
    }
    if (!Number.isInteger(record.expected.minExtractions) || record.expected.minExtractions < 0) {
      throw new Error(`line ${line}: expected.minExtractions must be a non-negative integer`);
    }
    if (!Number.isInteger(record.expected.maxExtractions) || record.expected.maxExtractions < 0) {
      throw new Error(`line ${line}: expected.maxExtractions must be a non-negative integer`);
    }
    if (record.expected.maxExtractions < record.expected.minExtractions) {
      throw new Error(`line ${line}: expected.maxExtractions must be >= expected.minExtractions`);
    }

    return record as RegressionDatasetCase;
  });
}

export async function loadRegressionDataset(path: string): Promise<RegressionDatasetCase[]> {
  const source = await readFile(path, "utf8");
  const records = parseJsonl(source);
  return validateRegressionDatasetRecords(records);
}
