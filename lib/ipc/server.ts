import type { ClientMessage, ServerMessage } from "./messages";
import { parseGherkin } from "@/lib/parser/gherkin-parser";
import { executeFeature } from "@/lib/engine/executor";
import { StepRegistry } from "@/lib/engine/step-registry";
import { PluginManager } from "@/lib/plugins/plugin-manager";
import { BuiltInHttpPlugin } from "@/lib/plugins/built-in-plugin";

export class IpcServer {
  private registry: StepRegistry;
  private pluginManager: PluginManager;
  private abortController: AbortController | null = null;
  private initialized = false;

  constructor() {
    this.registry = new StepRegistry();
    this.pluginManager = new PluginManager(this.registry);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.pluginManager.loadPlugin(new BuiltInHttpPlugin());
    this.initialized = true;
    console.log(`[Gherkin Engine] Initialized with ${this.registry.size} step definitions`);
  }

  listen(): void {
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name !== "gherkin-runner") return;

      console.log("[Gherkin IPC] Client connected");

      port.onMessage.addListener(async (message: ClientMessage) => {
        await this.handleMessage(message, port);
      });

      port.onDisconnect.addListener(() => {
        this.cancelExecution();
        console.log("[Gherkin IPC] Client disconnected");
      });
    });
  }

  private async handleMessage(
    message: ClientMessage,
    port: chrome.runtime.Port,
  ): Promise<void> {
    const send = (msg: ServerMessage) => {
      try {
        port.postMessage(msg);
      } catch {
        // Port may have disconnected
      }
    };

    switch (message.type) {
      case "parse":
        this.handleParse(message.source, send);
        break;
      case "execute":
        await this.handleExecute(message.source, send);
        break;
      case "cancel":
        this.cancelExecution();
        send({ type: "execute:cancelled" });
        break;
    }
  }

  private handleParse(
    source: string,
    send: (msg: ServerMessage) => void,
  ): void {
    const result = parseGherkin(source);

    if (result.ok) {
      send({
        type: "parse:success",
        featureName: result.feature.name,
        scenarioCount: result.feature.scenarios.length,
      });
    } else {
      send({ type: "parse:error", errors: result.errors });
    }
  }

  private async handleExecute(
    source: string,
    send: (msg: ServerMessage) => void,
  ): Promise<void> {
    await this.initialize();

    const parseResult = parseGherkin(source);

    if (!parseResult.ok) {
      send({ type: "parse:error", errors: parseResult.errors });
      return;
    }

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    send({ type: "execute:start", featureName: parseResult.feature.name });

    try {
      const result = await executeFeature(
        parseResult.feature,
        this.registry,
        signal,
        (stepResult, scenarioIndex) => {
          send({ type: "execute:step", result: stepResult, scenarioIndex });
        },
      );

      if (signal.aborted) {
        send({ type: "execute:cancelled" });
      } else {
        send({ type: "execute:done", result });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      send({ type: "execute:error", error: errorMsg });
    } finally {
      this.abortController = null;
    }
  }

  private cancelExecution(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
