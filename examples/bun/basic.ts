import { runPortabilityScenario } from "../shared/scenario.ts";

const result = await runPortabilityScenario("bun");
console.log(JSON.stringify(result, null, 2));
