import type { StepResult, FeatureResult } from "@/lib/engine/types";

export type ExecutionStatus = "idle" | "running" | "done" | "error" | "cancelled";

export type ExecutionState = {
  status: ExecutionStatus;
  featureName: string;
  stepResults: StepResult[];
  featureResult: FeatureResult | null;
  error: string | null;
  recording: boolean;
};

export const initialExecutionState: ExecutionState = {
  status: "idle",
  featureName: "",
  stepResults: [],
  featureResult: null,
  error: null,
  recording: false,
};
