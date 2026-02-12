import type { StepDefinition, ExecutionContext, HttpMethod, HttpResponse } from "@/lib/engine/types";

function resolveVariables(text: string, ctx: ExecutionContext): string {
  return text.replace(/#\{([^}]+)\}/g, (_, path: string) => {
    const value = resolvePath(ctx.variables, path.trim());
    return value !== undefined ? String(value) : `#{${path}}`;
  });
}

function resolvePath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function unquote(s: string): string {
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1);
  }
  return s;
}

async function executeHttpRequest(ctx: ExecutionContext): Promise<void> {
  let url = ctx.url;

  // Append query params
  if (Object.keys(ctx.params).length > 0) {
    const searchParams = new URLSearchParams(ctx.params);
    const separator = url.includes("?") ? "&" : "?";
    url = `${url}${separator}${searchParams.toString()}`;
  }

  const init: RequestInit = {
    method: ctx.method,
    headers: ctx.headers,
    signal: ctx.signal,
  };

  if (ctx.requestBody !== undefined && ctx.method !== "GET" && ctx.method !== "HEAD") {
    init.body =
      typeof ctx.requestBody === "string"
        ? ctx.requestBody
        : JSON.stringify(ctx.requestBody);

    if (!ctx.headers["Content-Type"] && !ctx.headers["content-type"]) {
      ctx.headers["Content-Type"] = "application/json";
    }
  }

  const start = performance.now();
  const fetchResponse = await fetch(url, init);
  const responseTime = performance.now() - start;

  const responseHeaders: Record<string, string> = {};
  fetchResponse.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  let body: unknown;
  const contentType = fetchResponse.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = await fetchResponse.json();
  } else {
    body = await fetchResponse.text();
  }

  ctx.response = {
    status: fetchResponse.status,
    statusText: fetchResponse.statusText,
    headers: responseHeaders,
    body,
    responseTime,
  };
}

export function getHttpStepDefinitions(): StepDefinition[] {
  return [
    // url 'https://...'
    {
      pattern: /^url\s+(.+)$/,
      handler: async (ctx, match) => {
        ctx.url = resolveVariables(unquote(match.groups[0]!), ctx);
      },
      description: "Set the base URL for the HTTP request",
    },

    // method GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS
    {
      pattern: /^method\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)$/i,
      handler: async (ctx, match) => {
        ctx.method = match.groups[0]!.toUpperCase() as HttpMethod;
        await executeHttpRequest(ctx);
      },
      description: "Execute HTTP request with specified method",
    },

    // header Key = 'Value'
    {
      pattern: /^header\s+(.+?)\s*=\s*(.+)$/,
      handler: async (ctx, match) => {
        const key = match.groups[0]!.trim();
        const value = resolveVariables(unquote(match.groups[1]!.trim()), ctx);
        ctx.headers[key] = value;
      },
      description: "Set a request header",
    },

    // param key = 'value'
    {
      pattern: /^param\s+(.+?)\s*=\s*(.+)$/,
      handler: async (ctx, match) => {
        const key = match.groups[0]!.trim();
        const value = resolveVariables(unquote(match.groups[1]!.trim()), ctx);
        ctx.params[key] = value;
      },
      description: "Set a query parameter",
    },

    // request { ... } (inline JSON)
    {
      pattern: /^request\s+(.+)$/,
      handler: async (ctx, match) => {
        const bodyText = resolveVariables(match.groups[0]!, ctx);
        try {
          ctx.requestBody = JSON.parse(bodyText);
        } catch {
          ctx.requestBody = bodyText;
        }
      },
      description: "Set request body (inline)",
    },

    // request (with doc string)
    {
      pattern: /^request$/,
      handler: async (ctx, _match, docString) => {
        if (!docString) {
          throw new Error("'request' step requires a doc string body");
        }
        const bodyText = resolveVariables(docString, ctx);
        try {
          ctx.requestBody = JSON.parse(bodyText);
        } catch {
          ctx.requestBody = bodyText;
        }
      },
      description: "Set request body (doc string)",
    },

    // status 200
    {
      pattern: /^status\s+(\d+)$/,
      handler: async (ctx, match) => {
        const expected = parseInt(match.groups[0]!, 10);
        if (!ctx.response) {
          throw new Error("No response available. Did you execute a request with 'method'?");
        }
        if (ctx.response.status !== expected) {
          throw new Error(
            `Expected status ${expected} but got ${ctx.response.status}`,
          );
        }
      },
      description: "Assert response status code",
    },
  ];
}
