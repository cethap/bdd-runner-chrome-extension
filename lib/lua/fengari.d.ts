/* eslint-disable @typescript-eslint/no-explicit-any */

declare module "fengari" {
  export type LuaState = object;

  const lua: {
    LUA_OK: number;
    LUA_ERRRUN: number;
    LUA_ERRSYNTAX: number;
    LUA_ERRMEM: number;
    LUA_ERRERR: number;
    LUA_MULTRET: number;
    LUA_REGISTRYINDEX: number;
    LUA_RIDX_GLOBALS: number;
    LUA_MASKCOUNT: number;
    LUA_TNONE: number;
    LUA_TNIL: number;
    LUA_TBOOLEAN: number;
    LUA_TNUMBER: number;
    LUA_TSTRING: number;
    LUA_TTABLE: number;
    LUA_TFUNCTION: number;
    LUA_TUSERDATA: number;
    LUA_TLIGHTUSERDATA: number;

    lua_newstate(): LuaState;
    lua_close(L: LuaState): void;
    lua_gettop(L: LuaState): number;
    lua_settop(L: LuaState, idx: number): void;
    lua_pop(L: LuaState, n: number): void;
    lua_type(L: LuaState, idx: number): number;
    lua_pushnil(L: LuaState): void;
    lua_pushboolean(L: LuaState, b: boolean | number): void;
    lua_pushinteger(L: LuaState, n: number): void;
    lua_pushnumber(L: LuaState, n: number): void;
    lua_pushstring(L: LuaState, s: Uint8Array): void;
    lua_pushliteral(L: LuaState, s: string): void;
    lua_pushcfunction(L: LuaState, fn: (L: LuaState) => number): void;
    lua_pushvalue(L: LuaState, idx: number): void;
    lua_toboolean(L: LuaState, idx: number): boolean;
    lua_tonumber(L: LuaState, idx: number): number;
    lua_tointeger(L: LuaState, idx: number): number;
    lua_tojsstring(L: LuaState, idx: number): string;
    lua_tolstring(L: LuaState, idx: number): Uint8Array;
    lua_isnil(L: LuaState, idx: number): boolean;
    lua_isnumber(L: LuaState, idx: number): boolean;
    lua_isstring(L: LuaState, idx: number): boolean;
    lua_istable(L: LuaState, idx: number): boolean;
    lua_pcall(L: LuaState, nargs: number, nresults: number, errfunc: number): number;
    lua_call(L: LuaState, nargs: number, nresults: number): void;
    lua_newtable(L: LuaState): void;
    lua_createtable(L: LuaState, narr: number, nrec: number): void;
    lua_setfield(L: LuaState, idx: number, k: Uint8Array): void;
    lua_getfield(L: LuaState, idx: number, k: Uint8Array): number;
    lua_settable(L: LuaState, idx: number): void;
    lua_gettable(L: LuaState, idx: number): number;
    lua_rawgeti(L: LuaState, idx: number, n: number): number;
    lua_rawget(L: LuaState, idx: number): number;
    lua_rawset(L: LuaState, idx: number): void;
    lua_setglobal(L: LuaState, name: Uint8Array): void;
    lua_getglobal(L: LuaState, name: Uint8Array): number;
    lua_sethook(L: LuaState, fn: ((L: LuaState, ar: any) => void) | null, mask: number, count: number): void;
    lua_error(L: LuaState): never;
  };

  const lauxlib: {
    luaL_newstate(): LuaState;
    luaL_loadstring(L: LuaState, s: Uint8Array): number;
    luaL_dostring(L: LuaState, s: Uint8Array): number;
    luaL_ref(L: LuaState, t: number): number;
    luaL_unref(L: LuaState, t: number, ref: number): void;
    luaL_error(L: LuaState, s: Uint8Array, ...args: any[]): never;
    luaL_checkstring(L: LuaState, arg: number): Uint8Array;
    luaL_checknumber(L: LuaState, arg: number): number;
    luaL_checkinteger(L: LuaState, arg: number): number;
    luaL_requiref(L: LuaState, name: Uint8Array, fn: (L: LuaState) => number, global: number): void;
  };

  const lualib: {
    luaL_openlibs(L: LuaState): void;
    luaopen_base(L: LuaState): number;
    luaopen_coroutine(L: LuaState): number;
    luaopen_table(L: LuaState): number;
    luaopen_string(L: LuaState): number;
    luaopen_utf8(L: LuaState): number;
    luaopen_math(L: LuaState): number;
    luaopen_debug(L: LuaState): number;
    LUA_COLIBNAME: string;
    LUA_TABLIBNAME: string;
    LUA_STRLIBNAME: string;
    LUA_UTF8LIBNAME: string;
    LUA_MATHLIBNAME: string;
    LUA_DBLIBNAME: string;
  };

  function to_luastring(s: string, cache?: boolean): Uint8Array;
  function to_jsstring(s: Uint8Array): string;
}

declare module "fengari-interop" {
  import type { LuaState } from "fengari";

  function push(L: LuaState, value: any): void;
  function tojs(L: LuaState, idx: number): any;
  function luaopen_js(L: LuaState): number;
}
