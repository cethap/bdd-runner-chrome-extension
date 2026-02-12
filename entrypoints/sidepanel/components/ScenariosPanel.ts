import type { FeatureFile } from "@/lib/store/slices/files-slice";
import { parseGherkin } from "@/lib/parser/gherkin-parser";
import type { ParsedScenario } from "@/lib/parser/types";

export type ScenarioItem = {
    fileId: string;
    fileName: string;
    featureName: string;
    scenario: ParsedScenario;
    selected: boolean;
};

export type ScenariosPanelCallbacks = {
    onRunAll: () => void;
    onRunSelected: (items: ScenarioItem[]) => void;
    onRunSingle: (item: ScenarioItem) => void;
    onStop: () => void;
};

export class ScenariosPanel {
    private container: HTMLElement;
    private items: ScenarioItem[] = [];
    private callbacks: ScenariosPanelCallbacks;
    private running = false;

    constructor(container: HTMLElement, callbacks: ScenariosPanelCallbacks) {
        this.container = container;
        this.callbacks = callbacks;
    }

    loadFiles(files: FeatureFile[]): void {
        this.items = [];

        for (const file of files) {
            const result = parseGherkin(file.content);
            if (!result.ok) continue;

            for (const scenario of result.feature.scenarios) {
                this.items.push({
                    fileId: file.id,
                    fileName: file.name,
                    featureName: result.feature.name,
                    scenario,
                    selected: true,
                });
            }
        }

        this.render();
    }

    setRunning(running: boolean): void {
        this.running = running;
        this.render();
    }

    private render(): void {
        this.container.innerHTML = "";

        // ── Header with controls ──
        const header = document.createElement("div");
        header.className = "scenarios-header";

        const title = document.createElement("span");
        title.className = "scenarios-title";
        const selectedCount = this.items.filter((i) => i.selected).length;
        title.textContent = `Scenarios (${selectedCount}/${this.items.length})`;
        header.appendChild(title);

        const controls = document.createElement("div");
        controls.className = "scenarios-controls";

        if (!this.running) {
            const runAllBtn = document.createElement("button");
            runAllBtn.className = "toolbar-btn primary scenarios-run-btn";
            runAllBtn.textContent = "▶ Run All";
            runAllBtn.disabled = this.items.length === 0;
            runAllBtn.addEventListener("click", () => this.callbacks.onRunAll());
            controls.appendChild(runAllBtn);

            if (selectedCount > 0 && selectedCount < this.items.length) {
                const runSelBtn = document.createElement("button");
                runSelBtn.className = "toolbar-btn scenarios-run-btn";
                runSelBtn.textContent = `▶ Run ${selectedCount}`;
                runSelBtn.addEventListener("click", () => {
                    this.callbacks.onRunSelected(this.items.filter((i) => i.selected));
                });
                controls.appendChild(runSelBtn);
            }
        } else {
            const stopBtn = document.createElement("button");
            stopBtn.className = "toolbar-btn danger";
            stopBtn.textContent = "■ Stop";
            stopBtn.addEventListener("click", () => this.callbacks.onStop());
            controls.appendChild(stopBtn);
        }

        header.appendChild(controls);
        this.container.appendChild(header);

        // ── Select all checkbox ──
        if (this.items.length > 0) {
            const selectAll = document.createElement("div");
            selectAll.className = "scenario-select-all";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = this.items.every((i) => i.selected);
            checkbox.indeterminate =
                this.items.some((i) => i.selected) && !this.items.every((i) => i.selected);
            checkbox.addEventListener("change", () => {
                const checked = checkbox.checked;
                for (const item of this.items) item.selected = checked;
                this.render();
            });
            selectAll.appendChild(checkbox);

            const label = document.createElement("span");
            label.textContent = "Select all";
            label.className = "scenario-select-all-label";
            selectAll.appendChild(label);

            this.container.appendChild(selectAll);
        }

        // ── Scenario list ──
        const list = document.createElement("div");
        list.className = "scenarios-list";

        if (this.items.length === 0) {
            const empty = document.createElement("div");
            empty.className = "scenarios-empty";
            empty.innerHTML = `
        <div class="scenarios-empty-icon">📋</div>
        <div class="scenarios-empty-text">No saved scenarios</div>
        <div class="scenarios-empty-hint">Save feature files in the Editor tab first</div>
      `;
            list.appendChild(empty);
        }

        // Group by feature
        const groups = new Map<string, ScenarioItem[]>();
        for (const item of this.items) {
            const key = `${item.fileName}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(item);
        }

        for (const [fileName, groupItems] of groups) {
            // Feature group header
            const groupHeader = document.createElement("div");
            groupHeader.className = "scenario-group-header";
            groupHeader.textContent = fileName.replace(".feature", "");
            list.appendChild(groupHeader);

            for (const item of groupItems) {
                const row = document.createElement("div");
                row.className = "scenario-item";

                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.checked = item.selected;
                checkbox.addEventListener("change", () => {
                    item.selected = checkbox.checked;
                    this.render();
                });
                row.appendChild(checkbox);

                const name = document.createElement("span");
                name.className = "scenario-item-name";
                name.textContent = item.scenario.name;
                name.title = `${item.featureName} → ${item.scenario.name}`;
                row.appendChild(name);

                const stepsCount = document.createElement("span");
                stepsCount.className = "scenario-item-steps";
                stepsCount.textContent = `${item.scenario.steps.length} steps`;
                row.appendChild(stepsCount);

                if (!this.running) {
                    const playBtn = document.createElement("button");
                    playBtn.className = "scenario-play-btn";
                    playBtn.textContent = "▶";
                    playBtn.title = "Run this scenario";
                    playBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        this.callbacks.onRunSingle(item);
                    });
                    row.appendChild(playBtn);
                }

                list.appendChild(row);
            }
        }

        this.container.appendChild(list);
    }
}
