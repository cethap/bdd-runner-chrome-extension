export type ToolbarCallbacks = {
  onRun: () => void;
  onStop: () => void;
  onSave: () => void;
  onNewFile: () => void;
  onToggleFiles: () => void;
  onToggleScripts: () => void;
  onRecord: () => void;
};

export class Toolbar {
  private container: HTMLElement;
  private runBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;
  private recordBtn!: HTMLButtonElement;
  private saveBtn!: HTMLButtonElement;
  private fileNameEl!: HTMLSpanElement;

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
  }

  setFileName(name: string, dirty: boolean): void {
    this.fileNameEl.textContent = dirty ? `${name} \u2022` : name;
  }
}
