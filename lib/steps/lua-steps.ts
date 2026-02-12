import type { StepDefinition, ExecutionContext } from "@/lib/engine/types";
import type { LuaBridge } from "@/lib/lua/lua-bridge";
import type { LuaScript } from "@/lib/lua/types";

export function getLuaStepDefinitions(
  getBridge: () => LuaBridge,
  getScripts: () => LuaScript[],
): StepDefinition[] {
  return [
    // eval + doc string — execute inline Lua
    {
      pattern: /^eval$/,
      handler: async (ctx: ExecutionContext, _match, docString) => {
        if (!docString) {
          throw new Error("'eval' step requires a doc string with Lua code");
        }
        getBridge().execute(docString, ctx);
      },
      description: "Execute inline Lua code",
      source: "lua-plugin",
    },

    // def varName = eval + doc string — execute Lua, capture return value
    {
      pattern: /^def\s+(\w+)\s*=\s*eval$/,
      handler: async (ctx: ExecutionContext, match, docString) => {
        if (!docString) {
          throw new Error("'def ... = eval' step requires a doc string with Lua code");
        }
        const varName = match.groups[0]!;
        const result = getBridge().execute(docString, ctx);
        ctx.variables[varName] = result;
      },
      description: "Execute Lua and capture return value into variable",
      source: "lua-plugin",
    },

    // script '<name>' — execute a stored Lua script
    {
      pattern: /^script\s+'([^']+)'$/,
      handler: async (ctx: ExecutionContext, match) => {
        const scriptName = match.groups[0]!;
        const scripts = getScripts();
        const script = scripts.find(
          (s) => s.name === scriptName && s.enabled,
        );
        if (!script) {
          throw new Error(
            `Lua script '${scriptName}' not found or disabled`,
          );
        }
        getBridge().execute(script.code, ctx);
      },
      description: "Execute a stored Lua script by name",
      source: "lua-plugin",
    },
  ];
}
