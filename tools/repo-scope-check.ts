import { existsSync } from "node:fs";

const DISALLOWED_PATHS = [
  "internal",
  "research",
  "signals",
  "plans",
  "projects",
];

const found = DISALLOWED_PATHS.filter((path) => existsSync(path));

if (found.length > 0) {
  console.error(
    `repo-scope-check failed: disallowed path(s) present: ${found.join(",")}`,
  );
  process.exit(1);
}

console.log("repo-scope-check passed");
process.exit(0);
