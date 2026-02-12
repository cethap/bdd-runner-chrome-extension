import type { FeatureFile } from "@/lib/store/slices/files-slice";

export type FileManagerCallbacks = {
  onFileSelect: (file: FeatureFile) => void;
  onFileDelete: (file: FeatureFile) => void;
  onFileRename: (file: FeatureFile, newName: string) => void;
};

export class FileManager {
  private container: HTMLElement;
  private listEl!: HTMLElement;
  private callbacks: FileManagerCallbacks;
  private activeFileId: string | null = null;

  constructor(container: HTMLElement, callbacks: FileManagerCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.render();
  }

  private render(): void {
    const header = document.createElement("div");
    header.className = "file-list-header";
    header.textContent = "Feature Files";
    this.container.appendChild(header);

    this.listEl = document.createElement("div");
    this.listEl.className = "file-list";
    this.container.appendChild(this.listEl);
  }

  setFiles(files: FeatureFile[]): void {
    this.listEl.innerHTML = "";

    if (files.length === 0) {
      const empty = document.createElement("div");
      empty.className = "file-item";
      empty.style.color = "var(--text-muted)";
      empty.style.fontStyle = "italic";
      empty.textContent = "No files yet";
      this.listEl.appendChild(empty);
      return;
    }

    for (const file of files) {
      const item = document.createElement("div");
      item.className = `file-item${file.id === this.activeFileId ? " active" : ""}`;
      item.addEventListener("click", () => this.callbacks.onFileSelect(file));

      const icon = document.createElement("span");
      icon.textContent = "\uD83D\uDCDD";
      icon.style.fontSize = "11px";
      item.appendChild(icon);

      const name = document.createElement("span");
      name.className = "file-item-name";
      name.textContent = file.name;
      item.appendChild(name);

      const actions = document.createElement("div");
      actions.className = "file-item-actions";

      const renameBtn = document.createElement("button");
      renameBtn.className = "file-action-btn";
      renameBtn.textContent = "\u270E";
      renameBtn.title = "Rename";
      renameBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const newName = prompt("Rename file:", file.name);
        if (newName && newName !== file.name) {
          this.callbacks.onFileRename(file, newName);
        }
      });
      actions.appendChild(renameBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "file-action-btn";
      deleteBtn.textContent = "\u2715";
      deleteBtn.title = "Delete";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm(`Delete "${file.name}"?`)) {
          this.callbacks.onFileDelete(file);
        }
      });
      actions.appendChild(deleteBtn);

      item.appendChild(actions);
      this.listEl.appendChild(item);
    }
  }

  setActiveFile(id: string | null): void {
    this.activeFileId = id;
  }

  toggle(): void {
    this.container.classList.toggle("collapsed");
  }
}
