import type { ExecutionStatus } from "@/lib/store/slices/execution-slice";

export class StatusBar {
  private container: HTMLElement;
  private dotEl!: HTMLSpanElement;
  private statusTextEl!: HTMLSpanElement;
  private statsEl!: HTMLSpanElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.render();
  }

  private render(): void {
    const statusItem = document.createElement("div");
    statusItem.className = "status-item";

    this.dotEl = document.createElement("span");
    this.dotEl.className = "status-dot ready";
    statusItem.appendChild(this.dotEl);

    this.statusTextEl = document.createElement("span");
    this.statusTextEl.textContent = "Ready";
    statusItem.appendChild(this.statusTextEl);

    this.container.appendChild(statusItem);

    this.statsEl = document.createElement("span");
    this.statsEl.className = "status-item";
    this.container.appendChild(this.statsEl);
  }

  setStatus(status: ExecutionStatus): void {
    this.dotEl.className = "status-dot";

    switch (status) {
      case "idle":
        this.dotEl.classList.add("ready");
        this.statusTextEl.textContent = "Ready";
        break;
      case "running":
        this.dotEl.classList.add("running");
        this.statusTextEl.textContent = "Running...";
        break;
      case "done":
        this.dotEl.classList.add("ready");
        this.statusTextEl.textContent = "Done";
        break;
      case "error":
        this.dotEl.classList.add("error");
        this.statusTextEl.textContent = "Error";
        break;
      case "cancelled":
        this.dotEl.classList.add("ready");
        this.statusTextEl.textContent = "Cancelled";
        break;
    }
  }

  setStats(passed: number, failed: number, total: number, duration: number): void {
    this.statsEl.textContent = `${passed}/${total} passed · ${Math.round(duration)}ms`;
  }

  clearStats(): void {
    this.statsEl.textContent = "";
  }
}
