import type { StepDefinition, StepMatch } from "./types";
import type { StepRegistry } from "./step-registry";

export type MatchResult =
  | { found: true; definition: StepDefinition; match: StepMatch }
  | { found: false };

export function matchStep(
  text: string,
  registry: StepRegistry,
): MatchResult {
  for (const definition of registry.getAll()) {
    const regex = definition.pattern;
    const result = regex.exec(text);

    if (result) {
      const groups = result.slice(1);
      const params: Record<string, string> = {};

      // Extract named groups if any
      if (result.groups) {
        Object.assign(params, result.groups);
      }

      return {
        found: true,
        definition,
        match: { params, groups },
      };
    }
  }

  return { found: false };
}
