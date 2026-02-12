import type { ParsedStep } from "@/lib/parser/types";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";

export type HttpResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  responseTime: number;
};

export type StepStatus = "passed" | "failed" | "skipped" | "running" | "pending";

export type StepResult = {
  step: ParsedStep;
  status: StepStatus;
  error?: string;
  duration: number;
  response?: HttpResponse;
  printOutput?: string;
};

export type ScenarioResult = {
  name: string;
  stepResults: StepResult[];
  status: StepStatus;
  duration: number;
};

export type FeatureResult = {
  name: string;
  scenarioResults: ScenarioResult[];
  status: StepStatus;
  duration: number;
  stats: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
};

export type StepMatch = {
  params: Record<string, string>;
  groups: string[];
};

export type StepHandler = (
  ctx: ExecutionContext,
  match: StepMatch,
  docString?: string,
  dataTable?: string[][],
) => Promise<void>;

export type StepDefinition = {
  pattern: RegExp;
  handler: StepHandler;
  description?: string;
  source?: string;
};

export type ExecutionContext = {
  variables: Record<string, unknown>;
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  params: Record<string, string>;
  requestBody: unknown;
  response: HttpResponse | null;
  prints: string[];
  signal: AbortSignal;
};

export type ExecutionHooks = {
  beforeScenario?(ctx: ExecutionContext): Promise<void>;
  afterScenario?(ctx: ExecutionContext): Promise<void>;
};
