import type { Plugin } from "./plugin-types";
import type { StepDefinition, ExecutionContext } from "@/lib/engine/types";
import { CdpClient } from "@/lib/browser/cdp-client";
import { getBrowserStepDefinitions } from "@/lib/steps/browser-steps";

export class BrowserPlugin implements Plugin {
    id = "browser-cdp";
    name = "Browser Automation (CDP)";

    getStepDefinitions(): StepDefinition[] {
        return getBrowserStepDefinitions(() => new CdpClient());
    }

    async afterScenario(ctx: ExecutionContext): Promise<void> {
        // Clean up any lingering browser session
        if (ctx.browser) {
            try {
                await ctx.browser.detach();
            } catch {
                // Ignore cleanup errors
            }
            ctx.browser = null;
        }
    }

    async destroy(): Promise<void> {
        // Nothing to clean up at plugin level
    }
}
