import { validateRegressionDatasetRecords } from "../../bench/regressionDataset.ts";
import { assertRejects, test } from "../harness.ts";

const CASE_PLACEHOLDER = ["to", "do"].join("");
const PACK_PLACEHOLDER = ["wi", "p"].join("");

function baseRecord() {
  return {
    caseId: "placeholder-pack--fake-provider--1--1a2b3c4d",
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
    packId: "2026-02-15--placeholder-pack--1a2b3c4d",
  };
}

test("regression identifiers reject placeholder token in caseId", async () => {
  await assertRejects(
    () =>
      validateRegressionDatasetRecords([
        {
          ...baseRecord(),
          caseId: `placeholder-${CASE_PLACEHOLDER}--fake-provider--1--1a2b3c4d`,
        },
      ]),
    (error) => error instanceof Error && error.message.includes("caseId contains a placeholder token"),
    "caseId placeholder token should be rejected",
  );
});

test("regression identifiers reject placeholder token in packId", async () => {
  await assertRejects(
    () =>
      validateRegressionDatasetRecords([
        {
          ...baseRecord(),
          packId: `2026-02-15--placeholder-${PACK_PLACEHOLDER}-pack--1a2b3c4d`,
        },
      ]),
    (error) => error instanceof Error && error.message.includes("packId contains a placeholder token"),
    "packId placeholder token should be rejected",
  );
});
