import type { StepDefinition } from "@/lib/engine/types";

export interface Plugin {
  id: string;
  name: string;
  initialize?(): Promise<void>;
  getStepDefinitions(): StepDefinition[];
  beforeScenario?(): Promise<void>;
  afterScenario?(): Promise<void>;
  destroy?(): Promise<void>;
}
