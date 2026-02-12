import type { Plugin } from "./plugin-types";
import type { StepDefinition } from "@/lib/engine/types";
import { getHttpStepDefinitions } from "@/lib/steps/http-steps";
import { getAssertionStepDefinitions } from "@/lib/steps/assertion-steps";
import { getVariableStepDefinitions } from "@/lib/steps/variable-steps";

export class BuiltInHttpPlugin implements Plugin {
  id = "built-in-http";
  name = "HTTP Steps (Built-in)";

  getStepDefinitions(): StepDefinition[] {
    return [
      ...getHttpStepDefinitions(),
      ...getAssertionStepDefinitions(),
      ...getVariableStepDefinitions(),
    ];
  }
}
