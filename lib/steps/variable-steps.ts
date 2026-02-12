import type { StepDefinition, ExecutionContext } from "@/lib/engine/types";

function resolveValue(ctx: ExecutionContext, expr: string): unknown {
  const trimmed = expr.trim();

  // response or response.path
  if (trimmed === "response") {
    return ctx.response?.body;
  }
  if (trimmed.startsWith("response.")) {
    return resolvePath(ctx.response?.body, trimmed.slice("response.".length));
  }

  // Variable reference
  if (trimmed in ctx.variables) {
    return ctx.variables[trimmed];
  }

  // Variable path (e.g., myVar.field)
  const dotIndex = trimmed.indexOf(".");
  if (dotIndex > 0) {
    const varName = trimmed.slice(0, dotIndex);
    const rest = trimmed.slice(dotIndex + 1);
    if (varName in ctx.variables) {
      return resolvePath(ctx.variables[varName], rest);
    }
  }

  // Try JSON parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // Unquote strings
    if (
      (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }
}

function resolvePath(obj: unknown, path: string): unknown {
  const tokens = path.match(/\w+|\[\d+\]/g);
  if (!tokens) return undefined;

  let current: unknown = obj;

  for (const token of tokens) {
    if (current == null || typeof current !== "object") return undefined;

    const indexMatch = token.match(/^\[(\d+)\]$/);
    if (indexMatch) {
      if (Array.isArray(current)) {
        current = current[parseInt(indexMatch[1]!, 10)];
      } else {
        return undefined;
      }
    } else {
      current = (current as Record<string, unknown>)[token];
    }
  }

  return current;
}

export function getVariableStepDefinitions(): StepDefinition[] {
  return [
    // def varName = expression (but not 'eval' - that's handled by lua-steps)
    {
      pattern: /^def\s+(\w+)\s*=\s*(?!eval$)(.+)$/,
      handler: async (ctx, match) => {
        const varName = match.groups[0]!;
        const expr = match.groups[1]!;
        ctx.variables[varName] = resolveValue(ctx, expr);
      },
      description: "Define a variable from an expression",
    },

    // print expression
    {
      pattern: /^print\s+(.+)$/,
      handler: async (ctx, match) => {
        const expr = match.groups[0]!;
        const value = resolveValue(ctx, expr);
        const output = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
        ctx.prints.push(output);
        console.log("[Gherkin print]", output);
      },
      description: "Print a value to output",
    },
  ];
}
