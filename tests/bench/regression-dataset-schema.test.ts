import { loadRegressionDataset } from "../../bench/regressionDataset.ts";
import { assert, test } from "../harness.ts";

test("regression dataset records validate against the regression schema", async () => {
  const records = await loadRegressionDataset(
    "bench/datasets/regression.jsonl",
  );
  assert(
    records.length > 0,
    "regression dataset should contain at least one record",
  );
});
