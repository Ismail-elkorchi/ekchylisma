# Providers

## OpenAI
```ts
import { OpenAIProvider } from "ekchylisma";

const provider = new OpenAIProvider({
  apiKey: "<OPENAI_API_KEY>",
});
```

## Gemini
```ts
import { GeminiProvider } from "ekchylisma";

const provider = new GeminiProvider({
  apiKey: "<GEMINI_API_KEY>",
});
```

## Ollama
```ts
import { OllamaProvider } from "ekchylisma";

const provider = new OllamaProvider({
  baseUrl: "http://127.0.0.1:11434",
});
```

## Integration tests
- Run `npm run test:integration`.
- Tests are skipped when corresponding credentials are not present.
- Environment variables (Node runtime):
  - `OPENAI_API_KEY`
  - `GEMINI_API_KEY`
  - `OLLAMA_INTEGRATION=1` (for local Ollama test)
