import { runPortabilityScenario } from "../shared/scenario.ts";

export default {
  async fetch(): Promise<Response> {
    const result = await runPortabilityScenario("workers");
    return new Response(JSON.stringify(result, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    });
  },
};
