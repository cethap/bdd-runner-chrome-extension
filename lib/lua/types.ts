import type { ExecutionContext, StepHandler } from "@/lib/engine/types";

export type LuaScript = {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export type LuaBridge = {
  execute(code: string, ctx: ExecutionContext): unknown;
  reset(): void;
  destroy(): void;
};

export type LuaCustomStep = {
  pattern: RegExp;
  handler: StepHandler;
  source: string;
};
