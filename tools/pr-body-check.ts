import { readFile } from "node:fs/promises";

const TEMPLATE_PATH = ".github/PULL_REQUEST_TEMPLATE.md";

function extractHeadings(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^##\s+/.test(line));
}

type PullRequestEvent = {
  pull_request?: {
    body?: string | null;
    number?: number;
  };
};

async function run(): Promise<void> {
  const eventName = process.env.GITHUB_EVENT_NAME;
  if (eventName !== "pull_request") {
    console.log(`pr-body-check skipped: GITHUB_EVENT_NAME=${eventName ?? "undefined"}`);
    return;
  }

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error("pr-body-check requires GITHUB_EVENT_PATH for pull_request events.");
  }

  const [templateSource, eventSource] = await Promise.all([
    readFile(TEMPLATE_PATH, "utf8"),
    readFile(eventPath, "utf8"),
  ]);

  const requiredHeadings = extractHeadings(templateSource);
  if (requiredHeadings.length === 0) {
    throw new Error(`No heading lines found in ${TEMPLATE_PATH}.`);
  }

  const payload = JSON.parse(eventSource) as PullRequestEvent;
  const prBody = payload.pull_request?.body ?? "";

  const missingHeadings = requiredHeadings.filter((heading) => !prBody.includes(heading));
  if (missingHeadings.length > 0) {
    throw new Error(
      `PR body is missing required heading(s): ${missingHeadings.join(", ")}`,
    );
  }

  console.log(
    `pr-body-check passed (PR #${String(payload.pull_request?.number ?? "unknown")}, ${requiredHeadings.length} required headings present).`,
  );
}

run().catch((error) => {
  console.error(
    `pr-body-check failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
