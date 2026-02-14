import { runPortabilityScenario } from "../shared/scenario.ts";

const result = await runPortabilityScenario("node");
console.log(JSON.stringify(result, null, 2));
