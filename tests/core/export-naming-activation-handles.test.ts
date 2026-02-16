import * as apiExports from "../../src/index.ts";
import { assert, test } from "../harness.ts";

const FORBIDDEN_HEADS = ["util", "misc", "helper", "manager", "service"];
const PLACEHOLDER_PR_DASH = ["pr", "-\\d+"].join("");
const PLACEHOLDER_PR_UNDERSCORE = ["pr", "_\\d+"].join("");
const PLACEHOLDER_PR_SPACE = ["pr", " \\d+"].join("");
const PLACEHOLDER_TODO = ["to", "do"].join("");
const PLACEHOLDER_TBD = ["tb", "d"].join("");
const PLACEHOLDER_WIP = ["wi", "p"].join("");
const PLACEHOLDER_TOKEN = new RegExp(
  [
    "\\b(?:",
    PLACEHOLDER_PR_DASH,
    "|",
    PLACEHOLDER_PR_UNDERSCORE,
    "|",
    PLACEHOLDER_PR_SPACE,
    "|",
    PLACEHOLDER_TODO,
    "|",
    PLACEHOLDER_TBD,
    "|",
    PLACEHOLDER_WIP,
    ")\\b",
  ].join(""),
  "i",
);

test(
  "export naming activation handles reject forbidden heads and placeholder tokens",
  () => {
    const adversarialSamples = ["helperBridge", ["PR", "_42"].join("")];
    const matchedSampleCount = adversarialSamples.filter((name) => {
      const lower = name.toLowerCase();
      return FORBIDDEN_HEADS.some((head) => lower.includes(head)) ||
        PLACEHOLDER_TOKEN.test(name);
    }).length;
    assert(
      matchedSampleCount === adversarialSamples.length,
      "counterexample probes must be detected by export naming guard logic",
    );

    const invalidNames = Object.keys(apiExports).filter((name) => {
      const lower = name.toLowerCase();
      const hasForbiddenHead = FORBIDDEN_HEADS.some((head) =>
        lower.includes(head)
      );
      return hasForbiddenHead || PLACEHOLDER_TOKEN.test(name);
    });

    assert(
      invalidNames.length === 0,
      `found invalid export names: ${invalidNames.join(", ")}`,
    );
  },
);
