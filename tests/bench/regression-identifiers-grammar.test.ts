import { validateRegressionDatasetRecords } from "../../bench/regressionDataset.ts";
import { assert, assertEqual, assertRejects, test } from "../harness.ts";

function baseRecord() {
  return {
    caseId: "grammar-pack--fake-provider--1--1a2b3c4d",
    category: "json-parse",
    documentText: "Alpha Beta",
    instructions: "Extract Beta.",
    targetSchema: {
      type: "object",
      properties: {
        value: { type: "string" },
      },
      required: ["value"],
    },
    providerResponseText: "{\"value\":\"Beta\"}",
    expected: {
      emptyResultKind: "non_empty",
      minExtractions: 1,
      maxExtractions: 1,
    },
    sourceUrl: "https://example.com/source",
    sourceQuote: "Beta",
    packId: "2026-02-15--grammar-pack--1a2b3c4d",
  };
}

test("regression identifier grammar accepts valid ids", () => {
  const records = validateRegressionDatasetRecords([baseRecord()]);
  assertEqual(records[0].caseId, "grammar-pack--fake-provider--1--1a2b3c4d");
  assertEqual(records[0].packId, "2026-02-15--grammar-pack--1a2b3c4d");
});

test("regression identifier grammar rejects invalid caseId and packId", async () => {
  await assertRejects(
    () => validateRegressionDatasetRecords([{ ...baseRecord(), caseId: "invalid-case-id" }]),
    (error) =>
      error instanceof Error
      && error.message.includes("caseId does not match semantic identifier grammar"),
    "invalid caseId grammar should be rejected",
  );

  await assertRejects(
    () => validateRegressionDatasetRecords([{ ...baseRecord(), packId: "invalid-pack-id" }]),
    (error) =>
      error instanceof Error
      && error.message.includes("packId does not match semantic identifier grammar"),
    "invalid packId grammar should be rejected",
  );

  assert(true, "identifier grammar rejection assertions completed");
});
