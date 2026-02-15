import { execFile } from "node:child_process";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { assert, assertEqual, run, test } from "../harness.ts";

const execFileAsync = promisify(execFile);
const bundleDir = "tests/browser/.tmp";
const bundlePath = `${bundleDir}/app.bundle.js`;

test("browser harness bundles browser example against built distribution", async () => {
  await mkdir(bundleDir, { recursive: true });

  try {
    await execFileAsync("npm", ["run", "build"], {
      timeout: 120_000,
    });

    await execFileAsync("deno", [
      "bundle",
      "--platform",
      "browser",
      "examples/browser/app.ts",
      "-o",
      bundlePath,
    ], {
      timeout: 120_000,
    });

    const bundledStat = await stat(bundlePath);
    assert(bundledStat.isFile(), "browser bundle should exist");

    const bundledText = await readFile(bundlePath, "utf8");
    assert(bundledText.length > 0, "browser bundle should be non-empty");
    assertEqual(
      bundledText.includes("browser-example"),
      true,
      "browser bundle should include example run id",
    );
  } finally {
    await rm(bundleDir, { recursive: true, force: true });
  }
});

await run();
