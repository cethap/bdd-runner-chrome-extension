import type { Plugin } from "./plugin-types";
import type { StepDefinition, ExecutionContext } from "@/lib/engine/types";
import type { LuaScript } from "@/lib/lua/types";
import { LuaBridge } from "@/lib/lua/lua-bridge";
import { getLuaStepDefinitions } from "@/lib/steps/lua-steps";
import { loadLuaScripts } from "@/lib/storage/lua-storage";
import type { StepRegistry } from "@/lib/engine/step-registry";

export class LuaPlugin implements Plugin {
  id = "lua-scripting";
  name = "Lua Scripting";

  private bridge: LuaBridge | null = null;
  private scripts: LuaScript[] = [];
  private registry: StepRegistry;

  constructor(registry: StepRegistry) {
    this.registry = registry;
  }

  async initialize(): Promise<void> {
    this.scripts = await loadLuaScripts();
    this.ensureBridge();
    await this.loadUserScripts();
  }

  getStepDefinitions(): StepDefinition[] {
    return getLuaStepDefinitions(
      () => this.ensureBridge(),
      () => this.scripts,
    );
  }

  async beforeScenario(_ctx: ExecutionContext): Promise<void> {
    const bridge = this.ensureBridge();
    // Re-register custom steps from user scripts before each scenario
    this.registry.unregisterBySource("lua-custom");
    bridge.clearCustomSteps();
    await this.loadUserScripts();
    const customSteps = bridge.getCustomSteps();
    for (const step of customSteps) {
      this.registry.register({
        pattern: step.pattern,
        handler: step.handler,
        source: step.source,
        description: `Lua custom step: ${step.pattern.source}`,
      });
    }
  }

  async afterScenario(_ctx: ExecutionContext): Promise<void> {
    // Cleanup custom steps registered during scenario
    this.registry.unregisterBySource("lua-custom");
  }

  async destroy(): Promise<void> {
    if (this.bridge) {
      this.bridge.destroy();
      this.bridge = null;
    }
  }

  async reloadScripts(): Promise<void> {
    this.scripts = await loadLuaScripts();
  }

  private ensureBridge(): LuaBridge {
    if (!this.bridge) {
      this.bridge = new LuaBridge();
    }
    return this.bridge;
  }

  private async loadUserScripts(): Promise<void> {
    const bridge = this.ensureBridge();
    const enabledScripts = this.scripts.filter((s) => s.enabled);
    for (const script of enabledScripts) {
      try {
        // Create a dummy context for script loading (step() registration)
        const loadCtx: ExecutionContext = {
          variables: {},
          url: "",
          method: "GET",
          headers: {},
          params: {},
          requestBody: undefined,
          response: null,
          prints: [],
          signal: new AbortController().signal,
        };
        bridge.execute(script.code, loadCtx);
      } catch (err) {
        console.warn(
          `[Lua] Error loading script "${script.name}":`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }
}
