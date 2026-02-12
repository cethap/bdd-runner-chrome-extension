import { lua, lauxlib, to_luastring } from "fengari";
import { push, tojs } from "fengari-interop";
import type { ExecutionContext, StepMatch } from "@/lib/engine/types";
import type { LuaCustomStep } from "./types";

const {
  lua_pushcfunction,
  lua_setfield,
  lua_newtable,
  lua_setglobal,
  lua_gettop,
  lua_tojsstring,
  lua_type,
  LUA_TSTRING,
  LUA_TTABLE,
  LUA_TFUNCTION,
} = lua;

type LuaState = object;

export function registerStdlib(L: LuaState, customSteps: LuaCustomStep[]): void {
  registerJson(L);
  registerPrint(L);
  registerStepFn(L, customSteps);
}

function registerJson(L: LuaState): void {
  lua_newtable(L);

  // json.decode(str | object) -> table
  // Handles both string inputs (JSON.parse) and already-parsed JS objects
  // (fengari-interop proxies them as userdata — just push back as-is)
  lua_pushcfunction(L, (L: LuaState): number => {
    const argType = lua_type(L, 1);
    if (argType === LUA_TSTRING) {
      const str = lua_tojsstring(L, 1);
      try {
        const parsed = JSON.parse(str);
        push(L, parsed);
        return 1;
      } catch (e) {
        return lauxlib.luaL_error(
          L,
          to_luastring(`json.decode error: ${e instanceof Error ? e.message : String(e)}`),
        );
      }
    }
    // Already a JS object (userdata/table) — convert to JS and re-push
    const value = tojs(L, 1);
    if (value == null) {
      return lauxlib.luaL_error(L, to_luastring("json.decode: got nil/null"));
    }
    push(L, value);
    return 1;
  });
  lua_setfield(L, -2, to_luastring("decode"));

  // json.encode(table) -> string
  lua_pushcfunction(L, (L: LuaState): number => {
    const value = tojs(L, 1);
    try {
      const str = JSON.stringify(value);
      push(L, str);
      return 1;
    } catch (e) {
      return lauxlib.luaL_error(
        L,
        to_luastring(`json.encode error: ${e instanceof Error ? e.message : String(e)}`),
      );
    }
  });
  lua_setfield(L, -2, to_luastring("encode"));

  lua_setglobal(L, to_luastring("json"));
}

function registerPrint(L: LuaState): void {
  lua_pushcfunction(L, (L: LuaState): number => {
    const nargs = lua_gettop(L);
    const parts: string[] = [];

    for (let i = 1; i <= nargs; i++) {
      const t = lua_type(L, i);
      if (t === LUA_TSTRING) {
        parts.push(lua_tojsstring(L, i));
      } else if (t === LUA_TTABLE) {
        const val = tojs(L, i);
        parts.push(JSON.stringify(val));
      } else {
        const val = tojs(L, i);
        parts.push(String(val));
      }
    }

    const output = parts.join("\t");

    // Get ctx global to push to prints
    lua.lua_getglobal(L, to_luastring("ctx"));
    if (lua_type(L, -1) !== lua.LUA_TNIL) {
      const ctx = tojs(L, -1) as ExecutionContext;
      ctx.prints.push(output);
    }
    lua.lua_pop(L, 1);

    console.log("[Lua print]", output);
    return 0;
  });
  lua_setglobal(L, to_luastring("print"));
}

function registerStepFn(L: LuaState, customSteps: LuaCustomStep[]): void {
  lua_pushcfunction(L, (L: LuaState): number => {
    if (lua_type(L, 1) !== LUA_TSTRING) {
      return lauxlib.luaL_error(L, to_luastring("step() first argument must be a pattern string"));
    }
    if (lua_type(L, 2) !== LUA_TFUNCTION) {
      return lauxlib.luaL_error(L, to_luastring("step() second argument must be a function"));
    }

    const patternStr = lua_tojsstring(L, 1);
    const fnRef = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);

    let pattern: RegExp;
    try {
      pattern = new RegExp(patternStr);
    } catch {
      return lauxlib.luaL_error(
        L,
        to_luastring(`step() invalid regex pattern: ${patternStr}`),
      );
    }

    const customStep: LuaCustomStep = {
      pattern,
      handler: async (ctx: ExecutionContext, match: StepMatch) => {
        // Push the function ref onto the stack
        lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, fnRef);
        push(L, ctx);
        push(L, match.groups.length > 0 ? match.groups[0] : null);

        const status = lua.lua_pcall(L, 2, 0, 0);
        if (status !== lua.LUA_OK) {
          const err = lua_tojsstring(L, -1);
          lua.lua_pop(L, 1);
          throw new Error(err);
        }
      },
      source: "lua-custom",
    };

    customSteps.push(customStep);
    return 0;
  });
  lua_setglobal(L, to_luastring("step"));
}
