import type { StepDefinition, ExecutionContext } from "@/lib/engine/types";

export interface Plugin {
  id: string;
  name: string;
  initialize?(): Promise<void>;
  getStepDefinitions(): StepDefinition[];
  beforeScenario?(ctx: ExecutionContext): Promise<void>;
  afterScenario?(ctx: ExecutionContext): Promise<void>;
  destroy?(): Promise<void>;
}
