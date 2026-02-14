import { GeminiProvider } from "../../src/providers/gemini.ts";
import { OllamaProvider } from "../../src/providers/ollama.ts";
import { OpenAIProvider } from "../../src/providers/openai.ts";
import { ProviderError } from "../../src/providers/errors.ts";
import { assert, assertEqual, assertRejects, test } from "../harness.ts";

type MockFetchResult = {
  ok: boolean;
  status: number;
  json: unknown;
};

function createMockFetch(
  expectedUrlPattern: RegExp,
  expectedBodyChecks: Array<(body: Record<string, unknown>) => void>,
  result: MockFetchResult,
): typeof fetch {
  return (async (url: URL | RequestInfo, init?: RequestInit) => {
    const target = String(url);
    assert(expectedUrlPattern.test(target), `unexpected URL: ${target}`);

    const bodyText = String(init?.body ?? "{}");
    const body = JSON.parse(bodyText) as Record<string, unknown>;
    for (const check of expectedBodyChecks) {
      check(body);
    }

    return {
      ok: result.ok,
      status: result.status,
      async json() {
        return result.json;
      },
    } as Response;
  }) as typeof fetch;
}

test("OpenAIProvider sends structured output payload and parses response", async () => {
  const provider = new OpenAIProvider({ apiKey: "test-key" });
  const response = await provider.generate(
    {
      model: "gpt-test",
      prompt: "extract",
      schema: { type: "object", properties: { value: { type: "string" } } },
    },
    {
      fetchFn: createMockFetch(
        /\/chat\/completions$/,
        [
          (body) => assertEqual(body.model as string, "gpt-test"),
          (body) => assert((body.response_format as { type?: string }).type === "json_schema", "response_format should use json_schema"),
        ],
        {
          ok: true,
          status: 200,
          json: {
            choices: [{ message: { content: "{\"value\":\"ok\"}" } }],
          },
        },
      ),
    },
  );

  assertEqual(response.text, "{\"value\":\"ok\"}");
  assertEqual(response.runRecord.provider, "openai");
});

test("GeminiProvider uses responseSchema when provided", async () => {
  const provider = new GeminiProvider({ apiKey: "test-key" });
  const response = await provider.generate(
    {
      model: "gemini-test",
      prompt: "extract",
      schema: { type: "object" },
    },
    {
      fetchFn: createMockFetch(
        /:generateContent\?key=/,
        [
          (body) => {
            const generationConfig = body.generationConfig as {
              responseMimeType?: string;
            };
            assertEqual(generationConfig.responseMimeType, "application/json");
          },
        ],
        {
          ok: true,
          status: 200,
          json: {
            candidates: [
              {
                content: {
                  parts: [{ text: "{\"value\":\"ok\"}" }],
                },
              },
            ],
          },
        },
      ),
    },
  );

  assertEqual(response.text, "{\"value\":\"ok\"}");
  assertEqual(response.runRecord.provider, "gemini");
});

test("OllamaProvider sends /api/chat request and parses content", async () => {
  const provider = new OllamaProvider({ baseUrl: "http://localhost:11434" });
  const response = await provider.generate(
    {
      model: "llama-test",
      prompt: "extract",
      schema: { type: "object" },
    },
    {
      fetchFn: createMockFetch(
        /\/api\/chat$/,
        [
          (body) => assertEqual(body.model as string, "llama-test"),
          (body) => assert(typeof body.format === "object", "format should be schema object"),
        ],
        {
          ok: true,
          status: 200,
          json: {
            message: {
              content: "{\"value\":\"ok\"}",
            },
          },
        },
      ),
    },
  );

  assertEqual(response.text, "{\"value\":\"ok\"}");
  assertEqual(response.runRecord.provider, "ollama");
});

test("real providers classify HTTP failures as ProviderError", async () => {
  const provider = new OpenAIProvider({ apiKey: "test-key" });

  await assertRejects(
    () =>
      provider.generate(
        {
          model: "gpt-test",
          prompt: "extract",
        },
        {
          fetchFn: createMockFetch(/\/chat\/completions$/, [], {
            ok: false,
            status: 429,
            json: {},
          }),
        },
      ),
    (error) => error instanceof ProviderError && error.kind === "transient",
  );
});
