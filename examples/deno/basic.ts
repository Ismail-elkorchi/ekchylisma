import { runPortabilityScenario } from "../shared/scenario.ts";

const result = await runPortabilityScenario("deno");
console.log(JSON.stringify(result, null, 2));
