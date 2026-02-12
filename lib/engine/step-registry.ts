import type { StepDefinition } from "./types";

export class StepRegistry {
  private definitions: StepDefinition[] = [];

  register(definition: StepDefinition): void {
    this.definitions.push(definition);
  }

  registerAll(definitions: StepDefinition[]): void {
    this.definitions.push(...definitions);
  }

  getAll(): ReadonlyArray<StepDefinition> {
    return this.definitions;
  }

  clear(): void {
    this.definitions = [];
  }

  get size(): number {
    return this.definitions.length;
  }
}
