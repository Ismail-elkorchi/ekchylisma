import "./core/hash.test.ts";
import "./core/normalize.test.ts";
import "./core/invariants.test.ts";
import "./json/extract-json.test.ts";
import "./json/repair.test.ts";
import "./json/parse.test.ts";
import "./schema/validate.test.ts";
import "./schema/to-json-schema.test.ts";
import { run } from "./harness.ts";

await run();
