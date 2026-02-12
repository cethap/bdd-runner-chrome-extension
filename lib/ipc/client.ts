import type { ClientMessage, ServerMessage } from "./messages";

export type MessageHandler = (message: ServerMessage) => void;

export class IpcClient {
  private port: chrome.runtime.Port | null = null;
  private handlers: Set<MessageHandler> = new Set();

  connect(): void {
    this.port = chrome.runtime.connect({ name: "gherkin-runner" });

    this.port.onMessage.addListener((message: ServerMessage) => {
      for (const handler of this.handlers) {
        handler(message);
      }
    });

    this.port.onDisconnect.addListener(() => {
      this.port = null;
      console.log("[Gherkin IPC] Disconnected from background");
    });

    console.log("[Gherkin IPC] Connected to background");
  }

  send(message: ClientMessage): void {
    if (!this.port) {
      this.connect();
    }
    this.port!.postMessage(message);
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  disconnect(): void {
    this.port?.disconnect();
    this.port = null;
  }
}
