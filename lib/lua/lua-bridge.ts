import { lua, lauxlib, lualib, to_luastring } from "fengari";
import { push, tojs, luaopen_js } from "fengari-interop";
import { registerStdlib } from "./lua-stdlib";
import type { ExecutionContext } from "@/lib/engine/types";
import type { LuaCustomStep } from "./types";

const {
  LUA_OK,
  LUA_MASKCOUNT,
  lua_gettop,
  lua_settop,
  lua_pop,
  lua_type,
  lua_tojsstring,
  lua_pcall,
  lua_sethook,
  LUA_TNIL,
  LUA_TNONE,
  LUA_TBOOLEAN,
  LUA_TNUMBER,
  LUA_TSTRING,
  LUA_TTABLE,
} = lua;

const { luaL_newstate, luaL_loadstring, luaL_requiref } = lauxlib;

type LuaState = ReturnType<typeof luaL_newstate>;

export class LuaBridge {
  private L: LuaState;
  private customSteps: LuaCustomStep[] = [];

  constructor() {
    this.L = luaL_newstate();
    this.openSafeLibs();
    luaL_requiref(this.L, to_luastring("js"), luaopen_js, 1);
    lua_pop(this.L, 1);
    registerStdlib(this.L, this.customSteps);
  }

  /**
   * Open only browser-safe Lua standard libraries.
   * Skips io (requires fs/process.stdin) and os (requires tmp/child_process)
   * which crash in a Chrome extension service worker.
   */
  private openSafeLibs(): void {
    const libs: Array<[string, (L: object) => number]> = [
      ["_G", lualib.luaopen_base],
      [lualib.LUA_COLIBNAME, lualib.luaopen_coroutine],
      [lualib.LUA_TABLIBNAME, lualib.luaopen_table],
      [lualib.LUA_STRLIBNAME, lualib.luaopen_string],
      [lualib.LUA_UTF8LIBNAME, lualib.luaopen_utf8],
      [lualib.LUA_MATHLIBNAME, lualib.luaopen_math],
      [lualib.LUA_DBLIBNAME, lualib.luaopen_debug],
    ];
    for (const [name, opener] of libs) {
      luaL_requiref(this.L, to_luastring(name), opener, 1);
      lua_pop(this.L, 1);
    }
  }

  execute(code: string, ctx: ExecutionContext): unknown {
    this.pushGlobals(ctx);
    this.installAbortHook(ctx.signal);

    const bytecode = to_luastring(code);
    const loadStatus = luaL_loadstring(this.L, bytecode);

    if (loadStatus !== LUA_OK) {
      const err = lua_tojsstring(this.L, -1);
      lua_pop(this.L, 1);
      this.clearAbortHook();
      throw new Error(`Lua syntax error: ${err}`);
    }

    const top = lua_gettop(this.L) - 1;
    const callStatus = lua_pcall(this.L, 0, lua.LUA_MULTRET, 0);
    this.clearAbortHook();

    if (callStatus !== LUA_OK) {
      const err = lua_tojsstring(this.L, -1);
      lua_pop(this.L, 1);
      throw new Error(err);
    }

    const newTop = lua_gettop(this.L);
    if (newTop > top) {
      const result = this.readValue(-1);
      lua_settop(this.L, top);
      return result;
    }

    return undefined;
  }

  getCustomSteps(): LuaCustomStep[] {
    return [...this.customSteps];
  }

  clearCustomSteps(): void {
    this.customSteps.length = 0;
  }

  private pushGlobals(ctx: ExecutionContext): void {
    push(this.L, ctx);
    lua.lua_setglobal(this.L, to_luastring("ctx"));

    push(this.L, ctx.response);
    lua.lua_setglobal(this.L, to_luastring("response"));
  }

  private installAbortHook(signal: AbortSignal): void {
    lua_sethook(
      this.L,
      (L: LuaState) => {
        if (signal.aborted) {
          push(L, "Execution cancelled");
          lua.lua_error(L);
        }
      },
      LUA_MASKCOUNT,
      1000,
    );
  }

  private clearAbortHook(): void {
    lua_sethook(this.L, null, 0, 0);
  }

  private readValue(idx: number): unknown {
    const t = lua_type(this.L, idx);
    switch (t) {
      case LUA_TNIL:
      case LUA_TNONE:
        return undefined;
      case LUA_TBOOLEAN:
        return lua.lua_toboolean(this.L, idx);
      case LUA_TNUMBER:
        return lua.lua_tonumber(this.L, idx);
      case LUA_TSTRING:
        return lua_tojsstring(this.L, idx);
      case LUA_TTABLE:
        return tojs(this.L, idx);
      default:
        return tojs(this.L, idx);
    }
  }

  reset(): void {
    this.customSteps.length = 0;
  }

  destroy(): void {
    lua.lua_close(this.L);
  }
}
