import { readFile } from "node:fs/promises";
import { decodeStreamingJsonFrames } from "../../src/json/frameDecoder.ts";
import { assembleStreamingToolCalls } from "../../src/json/streamToolCallAssembler.ts";
import { assert, assertEqual, test } from "../harness.ts";

type ReplayFixture = {
  signal: string;
  sourceUrl: string;
  frames: unknown[];
  expected: Array<{
    index: number;
    id: string | null;
    name: string | null;
    arguments: string;
  }>;
};

async function loadReplayFixtures(): Promise<ReplayFixture[]> {
  const raw = await readFile(
    "tests/fixtures/stream-tool-call-replays.json",
    "utf8",
  );
  const parsed = JSON.parse(raw) as ReplayFixture[];
  assertEqual(parsed.length, 3, "replay fixture count must remain three");
  return parsed;
}

async function findReplayFixture(signal: string): Promise<ReplayFixture> {
  const fixtures = await loadReplayFixtures();
  const fixture = fixtures.find((entry) => entry.signal === signal);
  if (!fixture) {
    throw new Error(`missing replay fixture for ${signal}`);
  }
  return fixture;
}

function toSseSource(frames: unknown[]): string {
  const lines: string[] = [];
  for (const frame of frames) {
    const event = (frame as { event?: unknown }).event;
    if (typeof event === "string") {
      lines.push(`event: ${event}`);
    }
    lines.push(`data: ${JSON.stringify(frame)}`);
  }
  lines.push("data: [DONE]");
  return lines.join("\n");
}

test("langchainjs-like stream replay keeps tool-call args non-empty and complete", async () => {
  const fixture = await findReplayFixture(
    "langchainjs-responses-api-tool-call-empty",
  );
  assertEqual(
    fixture.sourceUrl,
    "https://github.com/langchain-ai/langchainjs/issues/9816",
  );

  const assembled = assembleStreamingToolCalls(fixture.frames);
  assertEqual(JSON.stringify(assembled), JSON.stringify(fixture.expected));
  assert(
    assembled[0].arguments.length > 0,
    "tool-call arguments must not be empty",
  );
});

test("pydanticai-like replay streams structured tool args and finalizes identically", async () => {
  const fixture = await findReplayFixture(
    "pydanticai-structured-streaming-consistency",
  );
  assertEqual(
    fixture.sourceUrl,
    "https://github.com/pydantic/pydantic-ai/issues/4260",
  );

  const assembled = assembleStreamingToolCalls(fixture.frames);
  assertEqual(JSON.stringify(assembled), JSON.stringify(fixture.expected));

  const decoded = decodeStreamingJsonFrames(toSseSource(fixture.frames));
  assertEqual(decoded.ok, true);
  if (decoded.ok) {
    assertEqual(decoded.text, fixture.expected[0].arguments);
  }
});

test("adversarial replay with interleaved text and tool deltas preserves deterministic order and content", async () => {
  const fixture = await findReplayFixture("interleaved-text-and-tool-deltas");
  const assembled = assembleStreamingToolCalls(fixture.frames);
  assertEqual(JSON.stringify(assembled), JSON.stringify(fixture.expected));

  const decoded = decodeStreamingJsonFrames(toSseSource(fixture.frames));
  assertEqual(decoded.ok, true);
  if (decoded.ok) {
    assertEqual(decoded.usedFrames, true);
    assertEqual(
      decoded.text,
      `${fixture.expected[0].arguments}\n${fixture.expected[1].arguments}`,
    );
  }
});
