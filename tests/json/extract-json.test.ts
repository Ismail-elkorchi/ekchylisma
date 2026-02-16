import {
  detectJsonFlavor,
  extractFirstJson,
} from "../../src/json/extractJson.ts";
import { jsonFixture, jsonlFixture, wrappedJsonFixture } from "./fixtures.ts";
import { assert, assertEqual, test } from "../harness.ts";

test("extractFirstJson finds first complete object inside text blob", () => {
  const slice = extractFirstJson(wrappedJsonFixture);
  assert(slice !== null, "slice should exist");
  assertEqual(slice?.text, '{"ok": true,}');
  assertEqual(slice?.kind, "object");
});

test("detectJsonFlavor distinguishes json and jsonl", () => {
  assertEqual(detectJsonFlavor(jsonFixture), "json");
  assertEqual(detectJsonFlavor(jsonlFixture), "jsonl");
  assertEqual(detectJsonFlavor("not json"), "unknown");
});
