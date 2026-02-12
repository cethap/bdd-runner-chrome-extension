import type { ExecutionContext, HttpMethod } from "./types";

export function createExecutionContext(signal: AbortSignal): ExecutionContext {
  return {
    variables: {},
    url: "",
    method: "GET" as HttpMethod,
    headers: {},
    params: {},
    requestBody: undefined,
    response: null,
    prints: [],
    signal,
  };
}

export function resetRequestState(ctx: ExecutionContext): void {
  ctx.url = "";
  ctx.method = "GET";
  ctx.headers = {};
  ctx.params = {};
  ctx.requestBody = undefined;
}
