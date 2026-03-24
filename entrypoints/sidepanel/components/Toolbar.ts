import type { RecorderMode } from "@/lib/recorder/types";

export type ToolbarCallbacks = {
  onRun: () => void;
  onStop: () => void;
  onSave: () => void;
  onNewFile: () => void;
  onToggleFiles: () => void;
  onToggleScripts: () => void;
  onRecord: () => void;
  onModeChange: (mode: RecorderMode) => void;
};

type ModeButton = {
  mode: RecorderMode;
  label: string;
  title: string;
};

const MODE_BUTTONS: ModeButton[] = [
  { mode: "inspecting", label: "\uD83D\uDD0D", title: "Inspect element" },
  { mode: "assert-text", label: "T", title: "Assert text content" },
  { mode: "assert-visibility", label: "\uD83D\uDC41", title: "Assert visible" },
  { mode: "assert-value", label: "=", title: "Assert input value" },
];

export class Toolbar {
  private container: HTMLElement;
  private runBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;
  private recordBtn!: HTMLButtonElement;
  private saveBtn!: HTMLButtonElement;
  private fileNameEl!: HTMLSpanElement;
  private modeContainer!: HTMLDivElement;
  private modeBtns: Map<RecorderMode, HTMLButtonElement> = new Map();
  private activeMode: RecorderMode = "recording";

  constructor(container: HTMLElement, callbacks: ToolbarCallbacks) {
    this.container = container;
    this.render(callbacks);
  }

  private render(cb: ToolbarCallbacks): void {
    const filesBtn = this.createButton("Files", "toolbar-btn", cb.onToggleFiles);
    this.container.appendChild(filesBtn);

    const scriptsBtn = this.createButton("Lua", "toolbar-btn", cb.onToggleScripts);
    this.container.appendChild(scriptsBtn);

    this.container.appendChild(this.createSeparator());

    const newBtn = this.createButton("+ New", "toolbar-btn", cb.onNewFile);
    this.container.appendChild(newBtn);

    this.saveBtn = this.createButton("Save", "toolbar-btn", cb.onSave);
    this.container.appendChild(this.saveBtn);

    this.container.appendChild(this.createSeparator());

    this.runBtn = this.createButton("\u25B6 Run", "toolbar-btn primary", cb.onRun);
    this.container.appendChild(this.runBtn);

    this.stopBtn = this.createButton("\u25A0 Stop", "toolbar-btn danger", cb.onStop);
    this.stopBtn.disabled = true;
    this.container.appendChild(this.stopBtn);

    this.recordBtn = this.createButton("\u25CF Rec", "toolbar-btn record", cb.onRecord);
    this.container.appendChild(this.recordBtn);

    // Mode buttons container (hidden until recording)
    this.modeContainer = document.createElement("div");
    this.modeContainer.className = "toolbar-modes";
    this.modeContainer.style.display = "none";

    for (const { mode, label, title } of MODE_BUTTONS) {
      const btn = this.createButton(label, "toolbar-btn mode-btn", () => {
        cb.onModeChange(mode);
      });
      btn.title = title;
      btn.dataset.mode = mode;
      this.modeBtns.set(mode, btn);
      this.modeContainer.appendChild(btn);
    }

    this.container.appendChild(this.modeContainer);

    this.fileNameEl = document.createElement("span");
    this.fileNameEl.className = "toolbar-filename";
    this.fileNameEl.textContent = "untitled.feature";
    this.container.appendChild(this.fileNameEl);
  }

  private createButton(
    text: string,
    className: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = className;
    btn.textContent = text;
    btn.addEventListener("click", onClick);
    return btn;
  }

  private createSeparator(): HTMLDivElement {
    const sep = document.createElement("div");
    sep.className = "toolbar-separator";
    return sep;
  }

  setRunning(running: boolean): void {
    this.runBtn.disabled = running;
    this.stopBtn.disabled = !running;
    this.recordBtn.disabled = running;
  }

  setRecording(recording: boolean): void {
    this.recordBtn.classList.toggle("recording", recording);
    this.recordBtn.textContent = recording ? "\u25A0 Stop Rec" : "\u25CF Rec";
    this.runBtn.disabled = recording;
    // Show/hide mode buttons based on recording state
    this.modeContainer.style.display = recording ? "flex" : "none";
    if (!recording) {
      this.activeMode = "recording";
      this.updateModeHighlight();
    }
  }

  setActiveMode(mode: RecorderMode): void {
    this.activeMode = mode;
    this.updateModeHighlight();
  }

  private updateModeHighlight(): void {
    for (const [btnMode, btn] of this.modeBtns) {
      btn.classList.toggle("mode-active", btnMode === this.activeMode);
    }
  }

  setFileName(name: string, dirty: boolean): void {
    this.fileNameEl.textContent = dirty ? `${name} \u2022` : name;
  }
}
