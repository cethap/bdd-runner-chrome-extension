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

type TreeNode = {
    fileName: string;
    featureName: string;
    items: ScenarioItem[];
    expanded: boolean;
};

export class ScenariosPanel {
    private container: HTMLElement;
    private items: ScenarioItem[] = [];
    private callbacks: ScenariosPanelCallbacks;
    private running = false;
    private treeState = new Map<string, boolean>(); // fileName -> expanded

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

        // Initialize tree state for new files (default expanded)
        const fileNames = new Set(this.items.map((i) => i.fileName));
        for (const name of fileNames) {
            if (!this.treeState.has(name)) {
                this.treeState.set(name, true);
            }
        }

        this.render();
    }

    setRunning(running: boolean): void {
        this.running = running;
        this.render();
    }

    private buildTree(): TreeNode[] {
        const nodes: TreeNode[] = [];
        const seen = new Map<string, TreeNode>();

        for (const item of this.items) {
            if (!seen.has(item.fileName)) {
                const node: TreeNode = {
                    fileName: item.fileName,
                    featureName: item.featureName,
                    items: [],
                    expanded: this.treeState.get(item.fileName) ?? true,
                };
                seen.set(item.fileName, node);
                nodes.push(node);
            }
            seen.get(item.fileName)!.items.push(item);
        }

        return nodes;
    }

    private render(): void {
        this.container.innerHTML = "";

        const tree = this.buildTree();
        const selectedCount = this.items.filter((i) => i.selected).length;
        const totalCount = this.items.length;

        // ── Toolbar ──
        const toolbar = document.createElement("div");
        toolbar.className = "te-toolbar";

        const summary = document.createElement("span");
        summary.className = "te-summary";
        summary.textContent = `${selectedCount}/${totalCount} scenarios`;
        toolbar.appendChild(summary);

        const actions = document.createElement("div");
        actions.className = "te-actions";

        if (!this.running) {
            const runAllBtn = this.createIconButton("▶", "Run All", "te-action-btn te-run", () =>
                this.callbacks.onRunAll(),
            );
            runAllBtn.disabled = totalCount === 0;
            actions.appendChild(runAllBtn);

            if (selectedCount > 0 && selectedCount < totalCount) {
                const runSelBtn = this.createIconButton(
                    "▶",
                    `Run ${selectedCount} selected`,
                    "te-action-btn",
                    () => this.callbacks.onRunSelected(this.items.filter((i) => i.selected)),
                );
                actions.appendChild(runSelBtn);
            }

            // Collapse/Expand all
            const allExpanded = tree.every((n) => n.expanded);
            const toggleIcon = allExpanded ? "⊟" : "⊞";
            const toggleBtn = this.createIconButton(
                toggleIcon,
                allExpanded ? "Collapse All" : "Expand All",
                "te-action-btn",
                () => {
                    const newState = !allExpanded;
                    for (const node of tree) {
                        this.treeState.set(node.fileName, newState);
                    }
                    this.render();
                },
            );
            actions.appendChild(toggleBtn);
        } else {
            const stopBtn = this.createIconButton("■", "Stop", "te-action-btn te-stop", () =>
                this.callbacks.onStop(),
            );
            actions.appendChild(stopBtn);
        }

        toolbar.appendChild(actions);
        this.container.appendChild(toolbar);

        // ── Tree ──
        const list = document.createElement("div");
        list.className = "te-tree";

        if (totalCount === 0) {
            const empty = document.createElement("div");
            empty.className = "te-empty";
            empty.innerHTML = `
                <span class="te-empty-icon">📋</span>
                <span class="te-empty-text">No scenarios found</span>
                <span class="te-empty-hint">Save feature files in the Editor tab</span>
            `;
            list.appendChild(empty);
        }

        for (const node of tree) {
            // Feature file node (top level)
            const fileNode = document.createElement("div");
            fileNode.className = "te-node te-file-node";

            const fileRow = document.createElement("div");
            fileRow.className = "te-row te-row-file";

            // Expand/collapse chevron
            const chevron = document.createElement("span");
            chevron.className = `te-chevron ${node.expanded ? "expanded" : ""}`;
            chevron.textContent = "›";
            fileRow.appendChild(chevron);

            // File checkbox
            const fileCheckbox = document.createElement("input");
            fileCheckbox.type = "checkbox";
            fileCheckbox.className = "te-checkbox";
            const allSelected = node.items.every((i) => i.selected);
            const someSelected = node.items.some((i) => i.selected);
            fileCheckbox.checked = allSelected;
            fileCheckbox.indeterminate = someSelected && !allSelected;
            fileCheckbox.addEventListener("change", (e) => {
                e.stopPropagation();
                const checked = fileCheckbox.checked;
                for (const item of node.items) item.selected = checked;
                this.render();
            });
            fileRow.appendChild(fileCheckbox);

            // File icon
            const fileIcon = document.createElement("span");
            fileIcon.className = "te-icon te-icon-file";
            fileIcon.textContent = "📄";
            fileRow.appendChild(fileIcon);

            // File name
            const fileName = document.createElement("span");
            fileName.className = "te-label te-label-file";
            fileName.textContent = node.fileName;
            fileName.title = node.fileName;
            fileRow.appendChild(fileName);

            // Scenario count badge
            const badge = document.createElement("span");
            badge.className = "te-badge";
            badge.textContent = `${node.items.length}`;
            fileRow.appendChild(badge);

            // Click to expand/collapse
            fileRow.addEventListener("click", (e) => {
                if ((e.target as HTMLElement).tagName === "INPUT") return;
                node.expanded = !node.expanded;
                this.treeState.set(node.fileName, node.expanded);
                this.render();
            });

            fileNode.appendChild(fileRow);

            // Children (scenarios)
            if (node.expanded) {
                const children = document.createElement("div");
                children.className = "te-children";

                // Feature name sub-header
                const featureRow = document.createElement("div");
                featureRow.className = "te-row te-row-feature";

                const featureGuide = document.createElement("span");
                featureGuide.className = "te-guide";
                featureRow.appendChild(featureGuide);

                const featureIcon = document.createElement("span");
                featureIcon.className = "te-icon te-icon-feature";
                featureIcon.textContent = "◆";
                featureRow.appendChild(featureIcon);

                const featureLabel = document.createElement("span");
                featureLabel.className = "te-label te-label-feature";
                featureLabel.textContent = node.featureName;
                featureLabel.title = node.featureName;
                featureRow.appendChild(featureLabel);

                children.appendChild(featureRow);

                // Scenario items
                for (let i = 0; i < node.items.length; i++) {
                    const item = node.items[i]!;
                    const isLast = i === node.items.length - 1;

                    const scenarioRow = document.createElement("div");
                    scenarioRow.className = `te-row te-row-scenario ${item.selected ? "selected" : ""}`;

                    // Tree guide
                    const guide = document.createElement("span");
                    guide.className = `te-guide ${isLast ? "te-guide-last" : ""}`;
                    scenarioRow.appendChild(guide);

                    // Checkbox
                    const checkbox = document.createElement("input");
                    checkbox.type = "checkbox";
                    checkbox.className = "te-checkbox";
                    checkbox.checked = item.selected;
                    checkbox.addEventListener("change", (e) => {
                        e.stopPropagation();
                        item.selected = checkbox.checked;
                        this.render();
                    });
                    scenarioRow.appendChild(checkbox);

                    // Status icon
                    const statusIcon = document.createElement("span");
                    statusIcon.className = "te-icon te-icon-scenario";
                    statusIcon.textContent = "○";
                    scenarioRow.appendChild(statusIcon);

                    // Name
                    const name = document.createElement("span");
                    name.className = "te-label te-label-scenario";
                    name.textContent = item.scenario.name;
                    name.title = `${item.featureName} → ${item.scenario.name}`;
                    scenarioRow.appendChild(name);

                    // Steps count
                    const steps = document.createElement("span");
                    steps.className = "te-meta";
                    steps.textContent = `${item.scenario.steps.length} steps`;
                    scenarioRow.appendChild(steps);

                    // Play button (hover reveal)
                    if (!this.running) {
                        const playBtn = document.createElement("button");
                        playBtn.className = "te-play-btn";
                        playBtn.textContent = "▶";
                        playBtn.title = "Run scenario";
                        playBtn.addEventListener("click", (e) => {
                            e.stopPropagation();
                            this.callbacks.onRunSingle(item);
                        });
                        scenarioRow.appendChild(playBtn);
                    }

                    children.appendChild(scenarioRow);
                }

                fileNode.appendChild(children);
            }

            list.appendChild(fileNode);
        }

        this.container.appendChild(list);
    }

    private createIconButton(
        icon: string,
        title: string,
        className: string,
        onClick: () => void,
    ): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.className = className;
        btn.textContent = icon;
        btn.title = title;
        btn.addEventListener("click", onClick);
        return btn;
    }
}
