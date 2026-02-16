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
    title?: string | null;
    number?: number;
    head?: {
      ref?: string | null;
    };
  };
};

const TITLE_REGEX =
  /^(build|ci|cleanup|docs|feat|fix|perf|refactor|test)\([a-z0-9-]+\): [A-Za-z0-9].+$/;
const BRANCH_REGEX =
  /^(build|ci|cleanup|docs|feat|fix|perf|refactor|test)\/[a-z0-9-]+$/;
const TITLE_FORBIDDEN_TOKEN_PATTERN =
  /PR-[0-9]+|\b(?:T[O][D][O]|T[B][D]|W[I][P])\b/;
const BRANCH_FORBIDDEN_TOKEN_PATTERN = /pr-[0-9]+/;

function assertTitlePolicy(prTitle: string): void {
  if (!TITLE_REGEX.test(prTitle)) {
    throw new Error(
      `PR title does not match required pattern: ${TITLE_REGEX.source}`,
    );
  }

  if (TITLE_FORBIDDEN_TOKEN_PATTERN.test(prTitle)) {
    throw new Error("PR title contains a forbidden token pattern.");
  }
}

function assertBranchPolicy(branchName: string): void {
  if (!BRANCH_REGEX.test(branchName)) {
    throw new Error(
      `PR branch does not match required pattern: ${BRANCH_REGEX.source}`,
    );
  }

  if (
    BRANCH_FORBIDDEN_TOKEN_PATTERN.test(branchName) ||
    branchName.includes("program")
  ) {
    throw new Error("PR branch contains a forbidden token pattern.");
  }
}

async function run(): Promise<void> {
  const eventName = process.env.GITHUB_EVENT_NAME;
  if (eventName !== "pull_request") {
    console.log(
      `pr-body-check skipped: GITHUB_EVENT_NAME=${eventName ?? "undefined"}`,
    );
    return;
  }

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error(
      "pr-body-check requires GITHUB_EVENT_PATH for pull_request events.",
    );
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
  const prTitle = payload.pull_request?.title ?? "";
  const branchName = payload.pull_request?.head?.ref ?? "";

  const missingHeadings = requiredHeadings.filter((heading) =>
    !prBody.includes(heading)
  );
  if (missingHeadings.length > 0) {
    throw new Error(
      `PR body is missing required heading(s): ${missingHeadings.join(", ")}`,
    );
  }

  assertTitlePolicy(prTitle);
  assertBranchPolicy(branchName);

  console.log(
    `pr-body-check passed (PR #${
      String(payload.pull_request?.number ?? "unknown")
    }, ${requiredHeadings.length} required headings present, title and branch policies validated).`,
  );
}

run().catch((error) => {
  console.error(
    `pr-body-check failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
});
