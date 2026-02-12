import type { StepResult, FeatureResult } from "@/lib/engine/types";

const STATUS_ICONS: Record<string, string> = {
  passed: "\u2713",
  failed: "\u2717",
  skipped: "\u2014",
  running: "\u25CB",
  pending: "\u25CB",
};

export class ResultsPanel {
  private container: HTMLElement;
  private listEl: HTMLElement | null = null;
  private headerEl: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  show(): void {
    this.container.classList.add("visible");
    this.container.innerHTML = "";

    this.headerEl = document.createElement("div");
    this.headerEl.className = "results-header";

    const title = document.createElement("span");
    title.textContent = "Results";
    this.headerEl.appendChild(title);

    const closeBtn = document.createElement("button");
    closeBtn.className = "results-close";
    closeBtn.textContent = "\u2715";
    closeBtn.addEventListener("click", () => this.hide());
    this.headerEl.appendChild(closeBtn);

    this.container.appendChild(this.headerEl);

    this.listEl = document.createElement("div");
    this.listEl.className = "results-list";
    this.container.appendChild(this.listEl);
  }

  hide(): void {
    this.container.classList.remove("visible");
  }

  clear(): void {
    if (this.listEl) {
      this.listEl.innerHTML = "";
    }
  }

  addStepResult(result: StepResult): void {
    if (!this.listEl) return;

    const row = document.createElement("div");
    row.className = `step-result ${result.status}`;

    const icon = document.createElement("span");
    icon.className = "icon";
    icon.textContent = STATUS_ICONS[result.status] ?? "\u25CB";
    row.appendChild(icon);

    const text = document.createElement("span");
    text.className = "text";
    text.textContent = `${result.step.keyword} ${result.step.text}`;
    row.appendChild(text);

    const timing = document.createElement("span");
    timing.className = "step-timing";
    timing.textContent = result.duration > 0 ? `${Math.round(result.duration)}ms` : "";
    row.appendChild(timing);

    this.listEl.appendChild(row);

    // Error detail
    if (result.error) {
      const errorEl = document.createElement("div");
      errorEl.className = "step-error";
      errorEl.textContent = result.error;
      this.listEl.appendChild(errorEl);
    }

    // Print output
    if (result.printOutput) {
      const printEl = document.createElement("div");
      printEl.className = "step-response";
      printEl.textContent = result.printOutput;
      this.listEl.appendChild(printEl);
    }

    // Response preview (only for steps that executed HTTP requests)
    if (result.response && result.step.text.match(/^method\s/i)) {
      const responseEl = document.createElement("div");
      responseEl.className = "step-response";
      const body = result.response.body;
      responseEl.textContent =
        typeof body === "object" ? JSON.stringify(body, null, 2) : String(body);
      this.listEl.appendChild(responseEl);
    }

    // Auto-scroll to bottom
    this.container.scrollTop = this.container.scrollHeight;
  }

  showSummary(result: FeatureResult): void {
    if (!this.headerEl) return;

    const title = this.headerEl.querySelector("span");
    if (title) {
      const { passed, failed, skipped, total } = result.stats;
      title.textContent = `Results — ${passed}/${total} passed${failed > 0 ? `, ${failed} failed` : ""}${skipped > 0 ? `, ${skipped} skipped` : ""} (${Math.round(result.duration)}ms)`;
    }
  }
}
