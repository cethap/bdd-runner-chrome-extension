import type { LuaScript } from "@/lib/lua/types";

export type ScriptManagerCallbacks = {
  onSave: (name: string, code: string, id?: string) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
};

export class ScriptManager {
  private container: HTMLElement;
  private listEl!: HTMLElement;
  private editorEl!: HTMLTextAreaElement;
  private nameInput!: HTMLInputElement;
  private callbacks: ScriptManagerCallbacks;
  private scripts: LuaScript[] = [];
  private editingId: string | null = null;

  constructor(container: HTMLElement, callbacks: ScriptManagerCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = "";

    const header = document.createElement("div");
    header.className = "script-manager-header";

    const title = document.createElement("span");
    title.textContent = "Lua Scripts";
    header.appendChild(title);

    const newBtn = document.createElement("button");
    newBtn.className = "file-action-btn";
    newBtn.textContent = "+";
    newBtn.title = "New script";
    newBtn.addEventListener("click", () => this.showEditor());
    header.appendChild(newBtn);

    const closeBtn = document.createElement("button");
    closeBtn.className = "file-action-btn";
    closeBtn.textContent = "\u2715";
    closeBtn.title = "Close";
    closeBtn.addEventListener("click", () => this.hide());
    header.appendChild(closeBtn);

    this.container.appendChild(header);

    this.listEl = document.createElement("div");
    this.listEl.className = "script-list";
    this.container.appendChild(this.listEl);

    // Script editor (hidden by default)
    const editorPanel = document.createElement("div");
    editorPanel.className = "script-editor";
    editorPanel.style.display = "none";
    editorPanel.id = "script-editor-panel";

    this.nameInput = document.createElement("input");
    this.nameInput.className = "script-name-input";
    this.nameInput.placeholder = "Script name";
    editorPanel.appendChild(this.nameInput);

    this.editorEl = document.createElement("textarea");
    this.editorEl.className = "script-code-editor";
    this.editorEl.placeholder = '-- Lua code here\n-- Use step("^pattern$", function(ctx, match) ... end) to define custom steps';
    this.editorEl.spellcheck = false;
    editorPanel.appendChild(this.editorEl);

    const btnRow = document.createElement("div");
    btnRow.className = "script-editor-actions";

    const saveBtn = document.createElement("button");
    saveBtn.className = "toolbar-btn primary";
    saveBtn.textContent = "Save";
    saveBtn.style.fontSize = "11px";
    saveBtn.style.padding = "3px 10px";
    saveBtn.addEventListener("click", () => {
      const name = this.nameInput.value.trim();
      const code = this.editorEl.value;
      if (!name) return;
      this.callbacks.onSave(name, code, this.editingId ?? undefined);
      this.hideEditor();
    });
    btnRow.appendChild(saveBtn);

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "toolbar-btn";
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.fontSize = "11px";
    cancelBtn.style.padding = "3px 10px";
    cancelBtn.addEventListener("click", () => this.hideEditor());
    btnRow.appendChild(cancelBtn);

    editorPanel.appendChild(btnRow);
    this.container.appendChild(editorPanel);

    this.renderList();
  }

  private renderList(): void {
    this.listEl.innerHTML = "";

    if (this.scripts.length === 0) {
      const empty = document.createElement("div");
      empty.className = "script-empty";
      empty.textContent = "No scripts yet";
      this.listEl.appendChild(empty);
      return;
    }

    for (const script of this.scripts) {
      const item = document.createElement("div");
      item.className = "script-item";

      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = script.enabled;
      toggle.title = script.enabled ? "Disable" : "Enable";
      toggle.addEventListener("change", () => {
        this.callbacks.onToggle(script.id, toggle.checked);
      });
      item.appendChild(toggle);

      const name = document.createElement("span");
      name.className = "script-item-name";
      name.textContent = script.name;
      name.addEventListener("click", () => this.showEditor(script));
      item.appendChild(name);

      const actions = document.createElement("div");
      actions.className = "script-item-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "file-action-btn";
      editBtn.textContent = "\u270E";
      editBtn.title = "Edit";
      editBtn.addEventListener("click", () => this.showEditor(script));
      actions.appendChild(editBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "file-action-btn";
      deleteBtn.textContent = "\u2715";
      deleteBtn.title = "Delete";
      deleteBtn.addEventListener("click", () => {
        if (confirm(`Delete script "${script.name}"?`)) {
          this.callbacks.onDelete(script.id);
        }
      });
      actions.appendChild(deleteBtn);

      item.appendChild(actions);
      this.listEl.appendChild(item);
    }
  }

  private showEditor(script?: LuaScript): void {
    this.editingId = script?.id ?? null;
    this.nameInput.value = script?.name ?? "";
    this.editorEl.value = script?.code ?? "";
    const panel = this.container.querySelector("#script-editor-panel") as HTMLElement;
    if (panel) panel.style.display = "flex";
    this.nameInput.focus();
  }

  private hideEditor(): void {
    this.editingId = null;
    this.nameInput.value = "";
    this.editorEl.value = "";
    const panel = this.container.querySelector("#script-editor-panel") as HTMLElement;
    if (panel) panel.style.display = "none";
  }

  setScripts(scripts: LuaScript[]): void {
    this.scripts = scripts;
    this.renderList();
  }

  show(): void {
    this.container.classList.add("visible");
  }

  hide(): void {
    this.container.classList.remove("visible");
    this.hideEditor();
  }

  toggle(): void {
    if (this.container.classList.contains("visible")) {
      this.hide();
    } else {
      this.show();
    }
  }
}
