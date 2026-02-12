import type { StepResult, FeatureResult } from "@/lib/engine/types";
import type { ParseError } from "@/lib/parser/types";

// Messages from side panel → background
export type ClientMessage =
  | { type: "parse"; source: string }
  | { type: "execute"; source: string }
  | { type: "cancel" };

// Messages from background → side panel
export type ServerMessage =
  | { type: "parse:success"; featureName: string; scenarioCount: number }
  | { type: "parse:error"; errors: ParseError[] }
  | { type: "execute:start"; featureName: string }
  | { type: "execute:step"; result: StepResult; scenarioIndex: number }
  | { type: "execute:done"; result: FeatureResult }
  | { type: "execute:error"; error: string }
  | { type: "execute:cancelled" };
