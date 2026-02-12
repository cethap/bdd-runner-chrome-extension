import type { Plugin } from "./plugin-types";
import { StepRegistry } from "@/lib/engine/step-registry";

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private registry: StepRegistry;

  constructor(registry: StepRegistry) {
    this.registry = registry;
  }

  async loadPlugin(plugin: Plugin): Promise<void> {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin "${plugin.id}" is already loaded`);
    }

    if (plugin.initialize) {
      await plugin.initialize();
    }

    const steps = plugin.getStepDefinitions();
    this.registry.registerAll(steps);
    this.plugins.set(plugin.id, plugin);

    console.log(`[Gherkin] Plugin loaded: ${plugin.name} (${steps.length} steps)`);
  }

  async unloadPlugin(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) return;

    if (plugin.destroy) {
      await plugin.destroy();
    }

    this.plugins.delete(id);
  }

  async beforeScenario(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.beforeScenario) {
        await plugin.beforeScenario();
      }
    }
  }

  async afterScenario(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.afterScenario) {
        await plugin.afterScenario();
      }
    }
  }

  getLoadedPlugins(): string[] {
    return Array.from(this.plugins.keys());
  }

  async destroy(): Promise<void> {
    for (const [id] of this.plugins) {
      await this.unloadPlugin(id);
    }
  }
}
