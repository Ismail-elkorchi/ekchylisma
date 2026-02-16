import { decodeStreamingJsonFrames } from "../../src/json/frameDecoder.ts";
import { assert, assertEqual, test } from "../harness.ts";

test("decodeStreamingJsonFrames assembles SSE delta content into one JSON candidate", () => {
  const streamed = [
    "event: message",
    'data: {"choices":[{"delta":{"content":"{\\"extractions\\":["}}]}',
    'data: {"choices":[{"delta":{"content":"{\\"extractionClass\\":\\"token\\",\\"quote\\":\\"Beta\\",\\"span\\":{\\"offsetMode\\":\\"utf16_code_unit\\",\\"charStart\\":6,\\"charEnd\\":10},\\"grounding\\":\\"explicit\\"}"}}]}',
    'data: {"choices":[{"delta":{"content":"]}"}}]}',
    "data: [DONE]",
  ].join("\n");

  const decoded = decodeStreamingJsonFrames(streamed);
  assert(decoded.ok, "frame decoding should succeed");
  if (!decoded.ok) {
    return;
  }
  assertEqual(decoded.usedFrames, true);
  assert(
    decoded.text.includes('"extractions"'),
    "decoded payload should include extraction object content",
  );
});

test("decodeStreamingJsonFrames reports deterministic error on malformed frame", () => {
  const streamed = [
    "event: message",
    'data: {"choices":[{"delta":{"content":"{\\"extractions\\":["}}]}',
    'data: {"choices":[{"delta":{"content":"broken"}}',
  ].join("\n");

  const decoded = decodeStreamingJsonFrames(streamed);
  assertEqual(decoded.ok, false);
  if (decoded.ok) {
    return;
  }
  assertEqual(decoded.error.line, 3);
  assertEqual(decoded.error.message, "Malformed streamed frame at line 3.");
});
