import type { StepResult, FeatureResult } from "@/lib/engine/types";
import type { ParseError } from "@/lib/parser/types";
import type { LuaScript } from "@/lib/lua/types";

// Messages from side panel → background
export type ClientMessage =
  | { type: "parse"; source: string }
  | { type: "execute"; source: string }
  | { type: "cancel" }
  | { type: "lua:save"; name: string; code: string; id?: string }
  | { type: "lua:delete"; id: string }
  | { type: "lua:toggle"; id: string; enabled: boolean }
  | { type: "lua:list" }
  | { type: "lua:reload" }
  | { type: "record:start" }
  | { type: "record:stop" }
  | { type: "record:step"; step: string };

// Messages from background → side panel
export type ServerMessage =
  | { type: "parse:success"; featureName: string; scenarioCount: number }
  | { type: "parse:error"; errors: ParseError[] }
  | { type: "execute:start"; featureName: string }
  | { type: "execute:scenario"; scenarioName: string; scenarioIndex: number }
  | { type: "execute:step"; result: StepResult; scenarioIndex: number }
  | { type: "execute:done"; result: FeatureResult }
  | { type: "execute:error"; error: string }
  | { type: "execute:cancelled" }
  | { type: "lua:list"; scripts: LuaScript[] }
  | { type: "lua:saved"; script: LuaScript }
  | { type: "lua:deleted"; id: string }
  | { type: "lua:toggled"; id: string; enabled: boolean }
  | { type: "lua:toggled"; id: string; enabled: boolean }
  | { type: "lua:error"; error: string }
  | { type: "record:step"; step: string; isFirst?: boolean };
