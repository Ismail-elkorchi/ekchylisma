import { OpenAIProvider } from "../../src/providers/openai.ts";
import { GeminiProvider } from "../../src/providers/gemini.ts";
import { OllamaProvider } from "../../src/providers/ollama.ts";

function getNodeEnv(name: string): string | undefined {
  if (typeof process === "undefined" || !process.env) {
    return undefined;
  }

  return process.env[name];
}

async function maybeRunOpenAI(): Promise<void> {
  const apiKey = getNodeEnv("OPENAI_API_KEY");
  if (!apiKey) {
    console.log("skip - OpenAI integration (OPENAI_API_KEY missing)");
    return;
  }

  const provider = new OpenAIProvider({ apiKey });
  await provider.generate({
    model: "gpt-4o-mini",
    prompt: "Return JSON: {\"ok\":true}",
  });
  console.log("ok - OpenAI integration");
}

async function maybeRunGemini(): Promise<void> {
  const apiKey = getNodeEnv("GEMINI_API_KEY");
  if (!apiKey) {
    console.log("skip - Gemini integration (GEMINI_API_KEY missing)");
    return;
  }

  const provider = new GeminiProvider({ apiKey });
  await provider.generate({
    model: "gemini-1.5-flash",
    prompt: "Return JSON: {\"ok\":true}",
  });
  console.log("ok - Gemini integration");
}

async function maybeRunOllama(): Promise<void> {
  const enabled = getNodeEnv("OLLAMA_INTEGRATION") === "1";
  if (!enabled) {
    console.log("skip - Ollama integration (set OLLAMA_INTEGRATION=1)");
    return;
  }

  const provider = new OllamaProvider();
  await provider.generate({
    model: "llama3.1",
    prompt: "Return JSON: {\"ok\":true}",
  });
  console.log("ok - Ollama integration");
}

await maybeRunOpenAI();
await maybeRunGemini();
await maybeRunOllama();
