import { sha256Hex } from "../../src/core/hash.ts";
import { runSuite } from "../../src/eval/runSuite.ts";
import type { Provider, ProviderRequest, ProviderResponse } from "../../src/providers/types.ts";
import { assert, assertEqual, test } from "../harness.ts";

async function makeProgram() {
  return {
    instructions: "Extract named tokens.",
    examples: [],
    schema: { type: "object" },
    programHash: await sha256Hex("Extract named tokens."),
  };
}

class AlternatingProvider implements Provider {
  name = "alternating-provider";
  private callCount = 0;

  async generate(_request: ProviderRequest): Promise<ProviderResponse> {
    return this.nextResponse();
  }

  async generateStructured(_request: ProviderRequest): Promise<ProviderResponse> {
    return this.nextResponse();
  }

  private nextResponse(): ProviderResponse {
    this.callCount += 1;
    const even = this.callCount % 2 === 0;

    return {
      text: even
        ? JSON.stringify({ extractions: [] })
        : JSON.stringify({
          extractions: [
            {
              extractionClass: "token",
              quote: "Beta",
              span: { offsetMode: "utf16_code_unit", charStart: 6, charEnd: 10 },
              grounding: "explicit",
            },
          ],
        }),
      outputChannel: "text",
      runRecord: {
        provider: this.name,
        model: "fake-model",
        latencyMs: 0,
        retries: 0,
        requestHash: `req-${this.callCount}`,
      },
    };
  }
}

test("runSuite reports breadth metadata from prompt variants, seeds, and provider labels", async () => {
  const program = await makeProgram();

  const result = await runSuite({
    program,
    model: "fake-model",
    runs: 4,
    providerMode: "fake",
    promptVariants: ["base", "compact"],
    seedLabels: ["seed-a", "seed-b", "seed-c"],
    dataset: [
      {
        caseId: "breadth-one",
        providerLabel: "openai",
        documentText: "Alpha Beta",
        providerResponseText: "{\"extractions\":[{\"extractionClass\":\"token\",\"quote\":\"Beta\",\"span\":{\"offsetMode\":\"utf16_code_unit\",\"charStart\":6,\"charEnd\":10},\"grounding\":\"explicit\"}]}",
      },
      {
        caseId: "breadth-two",
        providerLabel: "gemini",
        documentText: "Gamma Delta",
        providerResponseText: "{\"extractions\":[{\"extractionClass\":\"token\",\"quote\":\"Gamma\",\"span\":{\"offsetMode\":\"utf16_code_unit\",\"charStart\":0,\"charEnd\":5},\"grounding\":\"explicit\"}]}",
      },
    ],
  });

  assertEqual(result.breadth.datasetCaseCount, 2);
  assertEqual(result.breadth.uniqueCaseIdCount, 2);
  assertEqual(result.breadth.providerLabelCount, 2);
  assertEqual(result.breadth.promptVariantCount, 2);
  assertEqual(result.breadth.seedCount, 3);
  assertEqual(result.variance.caseOutcomeDriftRate, 0);
});

test("runSuite detects case-outcome drift in variance report", async () => {
  const program = await makeProgram();

  const result = await runSuite({
    program,
    model: "fake-model",
    runs: 4,
    providerMode: "real",
    realProvider: new AlternatingProvider(),
    promptVariants: ["base"],
    seedLabels: ["seed-1"],
    dataset: [
      {
        caseId: "drift-one",
        documentText: "Alpha Beta",
        providerResponseText: "{\"extractions\":[]}",
      },
    ],
  });

  assert(result.variance.caseOutcomeDriftRate > 0, "expected drift rate to be > 0");
  assert(result.variance.stdDev > 0, "expected non-zero extraction stddev");
  assertEqual(result.variance.runCount, 4);
});

test("runSuite applies deterministic default labels when seeds and variants are omitted", async () => {
  const program = await makeProgram();

  const result = await runSuite({
    program,
    model: "fake-model",
    runs: 2,
    providerMode: "fake",
    dataset: [
      {
        caseId: "defaults",
        documentText: "Alpha Beta",
        providerResponseText: "{\"extractions\":[]}",
      },
    ],
  });

  assertEqual(result.runSummaries[0].promptVariant, "default-0");
  assertEqual(result.runSummaries[1].promptVariant, "default-1");
  assertEqual(result.runSummaries[0].seedLabel, "seed-0");
  assertEqual(result.runSummaries[1].seedLabel, "seed-1");
  assertEqual(result.breadth.providerLabelCount, 1);
});
