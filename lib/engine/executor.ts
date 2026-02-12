import type { ParsedFeature, ParsedStep, ParsedScenario } from "@/lib/parser/types";
import type {
  StepResult,
  ScenarioResult,
  FeatureResult,
  StepStatus,
  ExecutionContext,
  ExecutionHooks,
} from "./types";
import { StepRegistry } from "./step-registry";
import { matchStep } from "./step-matcher";
import { createExecutionContext, resetRequestState } from "./context";

export type StepProgressCallback = (result: StepResult, scenarioIndex: number) => void;
export type ScenarioProgressCallback = (scenarioName: string, scenarioIndex: number) => void;

export async function executeFeature(
  feature: ParsedFeature,
  registry: StepRegistry,
  signal: AbortSignal,
  onProgress?: StepProgressCallback,
  hooks?: ExecutionHooks,
  onScenarioStart?: ScenarioProgressCallback,
): Promise<FeatureResult> {
  const start = performance.now();
  const scenarioResults: ScenarioResult[] = [];
  let overallStatus: StepStatus = "passed";

  for (let i = 0; i < feature.scenarios.length; i++) {
    const scenario = feature.scenarios[i]!;

    if (signal.aborted) {
      scenarioResults.push(createSkippedScenario(scenario));
      overallStatus = "skipped";
      continue;
    }

    onScenarioStart?.(scenario.name, i);

    // Handle Scenario Outline with Examples
    if (scenario.examples && scenario.examples.length > 0) {
      for (const example of scenario.examples) {
        for (const row of example.tableBody) {
          const expandedSteps = expandOutlineSteps(
            scenario.steps,
            example.tableHeader,
            row,
          );
          const expandedScenario: ParsedScenario = {
            ...scenario,
            name: `${scenario.name} (${row.join(", ")})`,
            steps: expandedSteps,
          };
          const result = await executeScenario(
            expandedScenario,
            feature.background?.steps ?? [],
            registry,
            signal,
            i,
            onProgress,
            hooks,
          );
          scenarioResults.push(result);
          if (result.status === "failed") overallStatus = "failed";
        }
      }
    } else {
      const result = await executeScenario(
        scenario,
        feature.background?.steps ?? [],
        registry,
        signal,
        i,
        onProgress,
        hooks,
      );
      scenarioResults.push(result);
      if (result.status === "failed") overallStatus = "failed";
    }
  }

  const duration = performance.now() - start;
  const stats = {
    total: scenarioResults.reduce((sum, s) => sum + s.stepResults.length, 0),
    passed: scenarioResults.reduce(
      (sum, s) => sum + s.stepResults.filter((r) => r.status === "passed").length,
      0,
    ),
    failed: scenarioResults.reduce(
      (sum, s) => sum + s.stepResults.filter((r) => r.status === "failed").length,
      0,
    ),
    skipped: scenarioResults.reduce(
      (sum, s) => sum + s.stepResults.filter((r) => r.status === "skipped").length,
      0,
    ),
  };

  return { name: feature.name, scenarioResults, status: overallStatus, duration, stats };
}

async function executeScenario(
  scenario: ParsedScenario,
  backgroundSteps: ParsedStep[],
  registry: StepRegistry,
  signal: AbortSignal,
  scenarioIndex: number,
  onProgress?: StepProgressCallback,
  hooks?: ExecutionHooks,
): Promise<ScenarioResult> {
  const start = performance.now();
  const ctx = createExecutionContext(signal);
  const stepResults: StepResult[] = [];
  let scenarioFailed = false;

  if (hooks?.beforeScenario) {
    await hooks.beforeScenario(ctx);
  }

  const allSteps = [...backgroundSteps, ...scenario.steps];

  for (const step of allSteps) {
    if (signal.aborted || scenarioFailed) {
      const skipped: StepResult = {
        step,
        status: "skipped",
        duration: 0,
      };
      stepResults.push(skipped);
      onProgress?.(skipped, scenarioIndex);
      continue;
    }

    const result = await executeStep(step, ctx, registry);
    stepResults.push(result);
    onProgress?.(result, scenarioIndex);

    if (result.status === "failed") {
      scenarioFailed = true;
    }
  }

  if (hooks?.afterScenario) {
    await hooks.afterScenario(ctx);
  }

  const duration = performance.now() - start;
  const status: StepStatus = scenarioFailed
    ? "failed"
    : signal.aborted
      ? "skipped"
      : "passed";

  return { name: scenario.name, stepResults, status, duration };
}

async function executeStep(
  step: ParsedStep,
  ctx: ExecutionContext,
  registry: StepRegistry,
): Promise<StepResult> {
  const start = performance.now();

  const matchResult = matchStep(step.text, registry);

  if (!matchResult.found) {
    return {
      step,
      status: "failed",
      error: `No matching step definition for: "${step.text}"`,
      duration: performance.now() - start,
    };
  }

  try {
    await matchResult.definition.handler(
      ctx,
      matchResult.match,
      step.docString,
      step.dataTable,
    );

    const result: StepResult = {
      step,
      status: "passed",
      duration: performance.now() - start,
    };

    // Attach print output if any
    if (ctx.prints.length > 0) {
      const screenshotIdx = ctx.prints.findIndex((p) => p.startsWith("[screenshot:"));
      if (screenshotIdx >= 0) {
        const marker = ctx.prints.splice(screenshotIdx, 1)[0]!;
        result.screenshot = marker.slice("[screenshot:".length, -1);
      }
      if (ctx.prints.length > 0) {
        result.printOutput = ctx.prints.join("\n");
      }
      ctx.prints = [];
    }

    // Attach response info after HTTP execution
    if (ctx.response) {
      result.response = ctx.response;
    }

    return result;
  } catch (err) {
    return {
      step,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      duration: performance.now() - start,
    };
  }
}

function expandOutlineSteps(
  steps: ParsedStep[],
  headers: string[],
  values: string[],
): ParsedStep[] {
  return steps.map((step) => {
    let text = step.text;
    let docString = step.docString;

    for (let i = 0; i < headers.length; i++) {
      const placeholder = `<${headers[i]}>`;
      const value = values[i] ?? "";
      text = text.replaceAll(placeholder, value);
      if (docString) {
        docString = docString.replaceAll(placeholder, value);
      }
    }

    return { ...step, text, docString };
  });
}

function createSkippedScenario(scenario: ParsedScenario): ScenarioResult {
  return {
    name: scenario.name,
    stepResults: scenario.steps.map((step) => ({
      step,
      status: "skipped" as const,
      duration: 0,
    })),
    status: "skipped",
    duration: 0,
  };
}
