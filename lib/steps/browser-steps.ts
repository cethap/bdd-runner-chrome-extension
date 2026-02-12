import type { StepDefinition, ExecutionContext } from "@/lib/engine/types";
import type { CdpClient } from "@/lib/browser/cdp-client";

function unquote(s: string): string {
    if (
        (s.startsWith("'") && s.endsWith("'")) ||
        (s.startsWith('"') && s.endsWith('"'))
    ) {
        return s.slice(1, -1);
    }
    return s;
}

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

function getClient(ctx: ExecutionContext): CdpClient {
    if (!ctx.browser) {
        throw new Error("No browser session — use 'browser open' first");
    }
    return ctx.browser;
}

export function getBrowserStepDefinitions(
    createClient: () => CdpClient,
): StepDefinition[] {
    return [
        // ── browser open '<url>' ─────────────────────────────────
        {
            pattern: /^browser\s+open\s+(.+)$/,
            handler: async (ctx, match) => {
                const url = resolveVariables(unquote(match.groups[0]!), ctx);
                const client = createClient();
                ctx.browser = client;
                await client.openTab(url);
            },
            description: "Open a new tab and navigate to URL",
            source: "browser-plugin",
        },

        // ── browser navigate to '<url>' ──────────────────────────
        {
            pattern: /^browser\s+navigate\s+to\s+(.+)$/,
            handler: async (ctx, match) => {
                const url = resolveVariables(unquote(match.groups[0]!), ctx);
                const client = getClient(ctx);
                await client.navigate(url);
            },
            description: "Navigate current tab to URL",
            source: "browser-plugin",
        },

        // ── browser click '<selector>' ───────────────────────────
        {
            pattern: /^browser\s+click\s+(.+)$/,
            handler: async (ctx, match) => {
                const selector = resolveVariables(unquote(match.groups[0]!), ctx);
                await getClient(ctx).click(selector);
            },
            description: "Click an element by CSS selector",
            source: "browser-plugin",
        },

        // ── browser fill '<selector>' with '<value>' ─────────────
        {
            pattern: /^browser\s+fill\s+(.+?)\s+with\s+(.+)$/,
            handler: async (ctx, match) => {
                const selector = resolveVariables(unquote(match.groups[0]!), ctx);
                const value = resolveVariables(unquote(match.groups[1]!), ctx);
                await getClient(ctx).fill(selector, value);
            },
            description: "Type text into an input element",
            source: "browser-plugin",
        },

        // ── browser text '<selector>' == '<expected>' ────────────
        {
            pattern: /^browser\s+text\s+(.+?)\s*==\s*(.+)$/,
            handler: async (ctx, match) => {
                const selector = resolveVariables(unquote(match.groups[0]!), ctx);
                const expected = resolveVariables(unquote(match.groups[1]!), ctx);
                const actual = await getClient(ctx).getText(selector);
                if (actual !== expected) {
                    throw new Error(
                        `Expected text "${expected}" but got "${actual}"`,
                    );
                }
            },
            description: "Assert element text equals expected value",
            source: "browser-plugin",
        },

        // ── browser text '<selector>' contains '<text>' ──────────
        {
            pattern: /^browser\s+text\s+(.+?)\s+contains\s+(.+)$/,
            handler: async (ctx, match) => {
                const selector = resolveVariables(unquote(match.groups[0]!), ctx);
                const expected = resolveVariables(unquote(match.groups[1]!), ctx);
                const actual = await getClient(ctx).getText(selector);
                if (!actual.includes(expected)) {
                    throw new Error(
                        `Expected text to contain "${expected}" but got "${actual}"`,
                    );
                }
            },
            description: "Assert element text contains expected value",
            source: "browser-plugin",
        },

        // ── browser visible '<selector>' ─────────────────────────
        {
            pattern: /^browser\s+visible\s+(.+)$/,
            handler: async (ctx, match) => {
                const selector = resolveVariables(unquote(match.groups[0]!), ctx);
                const visible = await getClient(ctx).isVisible(selector);
                if (!visible) {
                    throw new Error(`Element is not visible: ${selector}`);
                }
            },
            description: "Assert element is visible",
            source: "browser-plugin",
        },

        // ── browser not visible '<selector>' ─────────────────────
        {
            pattern: /^browser\s+not\s+visible\s+(.+)$/,
            handler: async (ctx, match) => {
                const selector = resolveVariables(unquote(match.groups[0]!), ctx);
                const visible = await getClient(ctx).isVisible(selector);
                if (visible) {
                    throw new Error(`Element should not be visible: ${selector}`);
                }
            },
            description: "Assert element is not visible",
            source: "browser-plugin",
        },

        // ── browser screenshot ───────────────────────────────────
        {
            pattern: /^browser\s+screenshot$/,
            handler: async (ctx) => {
                const base64 = await getClient(ctx).screenshot();
                ctx.prints.push(`[screenshot:${base64}]`);
            },
            description: "Capture page screenshot",
            source: "browser-plugin",
        },

        // ── browser wait for '<selector>' ────────────────────────
        {
            pattern: /^browser\s+wait\s+for\s+(.+)$/,
            handler: async (ctx, match) => {
                const selector = resolveVariables(unquote(match.groups[0]!), ctx);
                await getClient(ctx).waitForSelector(selector);
            },
            description: "Wait for element to appear",
            source: "browser-plugin",
        },

        // ── browser select '<selector>' value '<option>' ─────────
        {
            pattern: /^browser\s+select\s+(.+?)\s+value\s+(.+)$/,
            handler: async (ctx, match) => {
                const selector = resolveVariables(unquote(match.groups[0]!), ctx);
                const value = resolveVariables(unquote(match.groups[1]!), ctx);
                await getClient(ctx).select(selector, value);
            },
            description: "Select a dropdown option",
            source: "browser-plugin",
        },

        // ── browser check '<selector>' ───────────────────────────
        {
            pattern: /^browser\s+check\s+(.+)$/,
            handler: async (ctx, match) => {
                const selector = resolveVariables(unquote(match.groups[0]!), ctx);
                await getClient(ctx).check(selector);
            },
            description: "Check a checkbox",
            source: "browser-plugin",
        },

        // ── browser uncheck '<selector>' ─────────────────────────
        {
            pattern: /^browser\s+uncheck\s+(.+)$/,
            handler: async (ctx, match) => {
                const selector = resolveVariables(unquote(match.groups[0]!), ctx);
                await getClient(ctx).uncheck(selector);
            },
            description: "Uncheck a checkbox",
            source: "browser-plugin",
        },

        // ── browser press '<key>' ────────────────────────────────
        {
            pattern: /^browser\s+press\s+(.+)$/,
            handler: async (ctx, match) => {
                const key = unquote(match.groups[0]!);
                await getClient(ctx).press(key);
            },
            description: "Press a keyboard key",
            source: "browser-plugin",
        },

        // ── browser close ────────────────────────────────────────
        {
            pattern: /^browser\s+close$/,
            handler: async (ctx) => {
                await getClient(ctx).closeTab();
                ctx.browser = null;
            },
            description: "Close browser tab and detach",
            source: "browser-plugin",
        },

        // ── def <var> = browser text '<selector>' ────────────────
        {
            pattern: /^def\s+(\w+)\s*=\s*browser\s+text\s+(.+)$/,
            handler: async (ctx, match) => {
                const varName = match.groups[0]!;
                const selector = resolveVariables(unquote(match.groups[1]!), ctx);
                ctx.variables[varName] = await getClient(ctx).getText(selector);
            },
            description: "Capture element text into a variable",
            source: "browser-plugin",
        },

        // ── def <var> = browser value '<selector>' ───────────────
        {
            pattern: /^def\s+(\w+)\s*=\s*browser\s+value\s+(.+)$/,
            handler: async (ctx, match) => {
                const varName = match.groups[0]!;
                const selector = resolveVariables(unquote(match.groups[1]!), ctx);
                ctx.variables[varName] = await getClient(ctx).getValue(selector);
            },
            description: "Capture input value into a variable",
            source: "browser-plugin",
        },
    ];
}
