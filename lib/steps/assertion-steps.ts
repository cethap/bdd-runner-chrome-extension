import type { StepDefinition, ExecutionContext } from "@/lib/engine/types";

function resolveResponsePath(ctx: ExecutionContext, path: string): unknown {
  if (path === "response") {
    return ctx.response?.body;
  }

  // response.field or response[0] or response[0].field
  if (path.startsWith("response")) {
    const rest = path.slice("response".length);
    if (rest.startsWith(".") || rest.startsWith("[")) {
      const normalizedPath = rest.startsWith(".") ? rest.slice(1) : rest;
      return resolvePath(ctx.response?.body, normalizedPath);
    }
  }

  // Check variables
  if (path in ctx.variables) {
    return ctx.variables[path];
  }

  // Try variable path (varName.field or varName[0])
  const sepIndex = path.search(/[.\[]/);
  if (sepIndex > 0) {
    const varName = path.slice(0, sepIndex);
    const rest = path.slice(sepIndex);
    const normalizedRest = rest.startsWith(".") ? rest.slice(1) : rest;
    if (varName in ctx.variables) {
      return resolvePath(ctx.variables[varName], normalizedRest);
    }
  }

  return undefined;
}

function resolvePath(obj: unknown, path: string): unknown {
  // Split into tokens: field names and [index] accessors
  const tokens = path.match(/\w+|\[\d+\]/g);
  if (!tokens) return undefined;

  let current: unknown = obj;

  for (const token of tokens) {
    if (current == null || typeof current !== "object") return undefined;

    // Array index: [0]
    const indexMatch = token.match(/^\[(\d+)\]$/);
    if (indexMatch) {
      if (Array.isArray(current)) {
        current = current[parseInt(indexMatch[1]!, 10)];
      } else {
        return undefined;
      }
    } else {
      // Object key
      current = (current as Record<string, unknown>)[token];
    }
  }

  return current;
}

// Type marker checking (#number, #string, #boolean, #null, #notnull, #array, #present)
function checkTypeMarker(value: unknown, marker: string): boolean {
  switch (marker) {
    case "#number":
      return typeof value === "number";
    case "#string":
      return typeof value === "string";
    case "#boolean":
      return typeof value === "boolean";
    case "#null":
      return value === null;
    case "#notnull":
      return value !== null && value !== undefined;
    case "#present":
      return value !== undefined;
    case "#array":
      return Array.isArray(value);
    default:
      return false;
  }
}

// Parse relaxed JSON-like syntax (Karate-style with unquoted keys and type markers)
function parseKarateExpression(text: string): unknown {
  const trimmed = text.trim();

  // Type markers as standalone value
  if (trimmed.startsWith("#")) {
    return trimmed;
  }

  // Try standard JSON first
  try {
    return JSON.parse(trimmed);
  } catch {
    // Karate-style: unquoted keys, single quotes, type markers (#number etc.)
    const jsonified = trimmed
      .replace(/'/g, '"')
      // Quote type markers so they become valid JSON strings
      .replace(/#(number|string|boolean|null|notnull|present|array)\b/g, '"#$1"')
      .replace(/(\w+)\s*:/g, '"$1":');
    try {
      return JSON.parse(jsonified);
    } catch {
      return trimmed;
    }
  }
}

function deepMatch(actual: unknown, expected: unknown, partial: boolean): string | null {
  // Type marker check
  if (typeof expected === "string" && expected.startsWith("#")) {
    if (!checkTypeMarker(actual, expected)) {
      return `Expected type ${expected} but got ${typeof actual} (${JSON.stringify(actual)})`;
    }
    return null;
  }

  // Object comparison
  if (expected !== null && typeof expected === "object" && !Array.isArray(expected)) {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) {
      return `Expected object but got ${JSON.stringify(actual)}`;
    }

    const expectedObj = expected as Record<string, unknown>;
    const actualObj = actual as Record<string, unknown>;

    for (const key of Object.keys(expectedObj)) {
      if (!(key in actualObj) && !partial) {
        return `Missing key "${key}" in response`;
      }
      const err = deepMatch(actualObj[key], expectedObj[key], partial);
      if (err) return `At "${key}": ${err}`;
    }

    if (!partial) {
      for (const key of Object.keys(actualObj)) {
        if (!(key in expectedObj)) {
          return `Unexpected key "${key}" in response`;
        }
      }
    }

    return null;
  }

  // Array comparison
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      return `Expected array but got ${typeof actual}`;
    }

    if (partial) {
      // Contains: each expected item must exist in actual
      for (let i = 0; i < expected.length; i++) {
        const found = actual.some((a) => deepMatch(a, expected[i], false) === null);
        if (!found) {
          return `Array does not contain expected element at index ${i}: ${JSON.stringify(expected[i])}`;
        }
      }
    } else {
      if (actual.length !== expected.length) {
        return `Expected array of length ${expected.length} but got ${actual.length}`;
      }
      for (let i = 0; i < expected.length; i++) {
        const err = deepMatch(actual[i], expected[i], false);
        if (err) return `At index [${i}]: ${err}`;
      }
    }

    return null;
  }

  // Primitive comparison
  if (actual !== expected) {
    return `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`;
  }

  return null;
}

function unquote(s: string): string {
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1);
  }
  return s;
}

export function getAssertionStepDefinitions(): StepDefinition[] {
  return [
    // match response.path == 'value' / match response == { ... }
    {
      pattern: /^match\s+(.+?)\s*==\s*(.+)$/,
      handler: async (ctx, match) => {
        const path = match.groups[0]!.trim();
        const expectedRaw = match.groups[1]!.trim();
        const actual = resolveResponsePath(ctx, path);
        const expected = parseKarateExpression(unquote(expectedRaw));
        const err = deepMatch(actual, expected, false);
        if (err) throw new Error(err);
      },
      description: "Assert exact equality",
    },

    // match response contains { ... }
    {
      pattern: /^match\s+(.+?)\s+contains\s+(.+)$/,
      handler: async (ctx, match) => {
        const path = match.groups[0]!.trim();
        const expectedRaw = match.groups[1]!.trim();
        const actual = resolveResponsePath(ctx, path);
        const expected = parseKarateExpression(expectedRaw);
        const err = deepMatch(actual, expected, true);
        if (err) throw new Error(err);
      },
      description: "Assert partial match (contains)",
    },

    // match response.path != null
    {
      pattern: /^match\s+(.+?)\s*!=\s*null$/,
      handler: async (ctx, match) => {
        const path = match.groups[0]!.trim();
        const actual = resolveResponsePath(ctx, path);
        if (actual === null || actual === undefined) {
          throw new Error(`Expected "${path}" to not be null but it was ${JSON.stringify(actual)}`);
        }
      },
      description: "Assert value is not null",
    },
  ];
}
