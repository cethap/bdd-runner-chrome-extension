import "./styles.css";
import { Editor } from "./components/Editor";
import { Toolbar } from "./components/Toolbar";
import { ResultsPanel } from "./components/ResultsPanel";
import { StatusBar } from "./components/StatusBar";
import { FileManager } from "./components/FileManager";
import { ScriptManager } from "./components/ScriptManager";
import { ScenariosPanel } from "./components/ScenariosPanel";
import type { ScenarioItem } from "./components/ScenariosPanel";
import { parseGherkin } from "@/lib/parser/gherkin-parser";
import { IpcClient } from "@/lib/ipc/client";
import { Store } from "@/lib/store/store";
import {
  loadFeatureFiles,
  saveFeatureFile,
  deleteFeatureFile,
  renameFeatureFile,
} from "@/lib/storage/feature-storage";
import type { EditorState } from "@/lib/store/slices/editor-slice";
import type { ExecutionState } from "@/lib/store/slices/execution-slice";
import type { FilesState } from "@/lib/store/slices/files-slice";
import type { FeatureFile } from "@/lib/store/slices/files-slice";

type AppState = EditorState & ExecutionState & FilesState;

const initialState: AppState = {
  currentFileId: null,
  currentFileName: "untitled.feature",
  content: "",
  dirty: false,
  status: "idle",
  featureName: "",
  stepResults: [],
  featureResult: null,
  error: null,
  files: [],
  loading: false,
  recording: false,
};

// Store
const store = new Store<AppState>(initialState);

// IPC
const ipc = new IpcClient();
ipc.connect();

// ── Tab switching ──────────────────────────────────────────

const tabButtons = document.querySelectorAll<HTMLButtonElement>(".tab-btn");
const tabContents = document.querySelectorAll<HTMLElement>(".tab-content");

function switchTab(tabName: string) {
  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  tabContents.forEach((content) => {
    content.classList.toggle("active", content.id === `tab-${tabName}`);
  });

  // Refresh scenarios when switching to that tab
  if (tabName === "scenarios") {
    scenariosPanel.loadFiles(store.getState().files);
  }
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab!);
  });
});

// ── Components ─────────────────────────────────────────────

const editor = new Editor(document.getElementById("editor")!);
const resultsPanel = new ResultsPanel(document.getElementById("results-panel")!);
const statusBar = new StatusBar(document.getElementById("status-bar")!);

const scriptManager = new ScriptManager(document.getElementById("script-manager")!, {
  onSave: (name, code, id) => {
    ipc.send({ type: "lua:save", name, code, id });
  },
  onDelete: (id) => {
    ipc.send({ type: "lua:delete", id });
  },
  onToggle: (id, enabled) => {
    ipc.send({ type: "lua:toggle", id, enabled });
  },
});

// ── Helper: build feature source from scenario items (same feature) ───

function buildFeatureSource(featureName: string, items: ScenarioItem[]): string {
  const parts: string[] = [];
  parts.push(`Feature: ${featureName}\n`);
  for (const item of items) {
    parts.push(`  Scenario: ${item.scenario.name}`);
    for (const step of item.scenario.steps) {
      const docString = step.docString ? `\n      """\n${step.docString}\n      """` : "";
      parts.push(`    ${step.keyword} ${step.text}${docString}`);
    }
    parts.push("");
  }
  return parts.join("\n");
}

function startExecution(source: string) {
  store.setState({
    status: "running",
    stepResults: [],
    featureResult: null,
    error: null,
  });
  resultsPanel.show();
  resultsPanel.clear();
  statusBar.setStatus("running");
  statusBar.clearStats();
  switchTab("results");
  ipc.send({ type: "execute", source });
}

// Track when an execution finishes so we can chain multiple features
let executionResolve: (() => void) | null = null;

function waitForExecutionDone(): Promise<void> {
  return new Promise((resolve) => {
    executionResolve = resolve;
  });
}

async function startExecutionQueue(groups: { featureName: string; items: ScenarioItem[] }[]) {
  store.setState({
    status: "running",
    stepResults: [],
    featureResult: null,
    error: null,
  });
  resultsPanel.show();
  resultsPanel.clear();
  statusBar.setStatus("running");
  statusBar.clearStats();
  switchTab("results");

  for (const group of groups) {
    if (store.getState().status === "cancelled") break;
    const source = buildFeatureSource(group.featureName, group.items);
    ipc.send({ type: "execute", source });
    await waitForExecutionDone();
  }

  // All features done
  toolbar.setRunning(false);
  scenariosPanel.setRunning(false);
  if (store.getState().status !== "cancelled") {
    statusBar.setStatus("done");
  }
}

// ── Scenarios Panel ────────────────────────────────────────

const scenariosPanel = new ScenariosPanel(document.getElementById("scenarios-panel")!, {
  onRunAll: () => {
    const files = store.getState().files;
    const groups: { featureName: string; items: ScenarioItem[] }[] = [];
    for (const file of files) {
      const result = parseGherkin(file.content);
      if (!result.ok) continue;
      const items: ScenarioItem[] = result.feature.scenarios.map((scenario) => ({
        fileId: file.id,
        fileName: file.name,
        featureName: result.feature.name,
        scenario,
        selected: true,
      }));
      if (items.length > 0) {
        groups.push({ featureName: result.feature.name, items });
      }
    }
    startExecutionQueue(groups);
  },
  onRunSelected: (items: ScenarioItem[]) => {
    // Group by feature name
    const grouped = new Map<string, ScenarioItem[]>();
    for (const item of items) {
      if (!grouped.has(item.featureName)) grouped.set(item.featureName, []);
      grouped.get(item.featureName)!.push(item);
    }
    const groups = Array.from(grouped.entries()).map(([featureName, groupItems]) => ({
      featureName,
      items: groupItems,
    }));
    startExecutionQueue(groups);
  },
  onRunSingle: (item: ScenarioItem) => {
    const source = buildFeatureSource(item.featureName, [item]);
    startExecution(source);
  },
  onStop: () => {
    ipc.send({ type: "cancel" });
  },
});

// ── Toolbar (Editor tab) ───────────────────────────────────

const toolbar = new Toolbar(document.getElementById("toolbar")!, {
  onRun: () => {
    const content = editor.getContent();
    startExecution(content);
  },
  onStop: () => {
    ipc.send({ type: "cancel" });
  },
  onSave: async () => {
    const state = store.getState();
    const content = editor.getContent();
    const name = state.currentFileName;
    // If no file ID tracked, try to find existing file by name to avoid duplicates
    let fileId = state.currentFileId;
    if (!fileId) {
      const existing = state.files.find((f) => f.name === name);
      if (existing) fileId = existing.id;
    }
    const file = await saveFeatureFile(name, content, fileId ?? undefined);
    store.setState({
      currentFileId: file.id,
      currentFileName: file.name,
      content,
      dirty: false,
    });
    await refreshFiles();
  },
  onNewFile: () => {
    const name = prompt("File name:", "new-test.feature");
    if (!name) return;
    const fileName = name.endsWith(".feature") ? name : `${name}.feature`;
    editor.setContent(`Feature: ${fileName.replace(".feature", "")}\n\n  Scenario: \n    Given \n`);
    store.setState({
      currentFileId: null,
      currentFileName: fileName,
      content: editor.getContent(),
      dirty: true,
    });
  },
  onToggleFiles: () => {
    fileManager.toggle();
  },
  onToggleScripts: () => {
    scriptManager.toggle();
    if (document.getElementById("script-manager")!.classList.contains("visible")) {
      ipc.send({ type: "lua:list" });
      ipc.send({ type: "lua:list" });
    }
  },
  onRecord: () => {
    const recording = !store.getState().recording;
    store.setState({ recording });
    if (recording) {
      ipc.startRecording();
    } else {
      ipc.stopRecording();
    }
  },
});

// ── File Manager ───────────────────────────────────────────

const fileManager = new FileManager(document.getElementById("file-manager")!, {
  onFileSelect: (file: FeatureFile) => {
    editor.setContent(file.content);
    store.setState({
      currentFileId: file.id,
      currentFileName: file.name,
      content: file.content,
      dirty: false,
    });
    fileManager.setActiveFile(file.id);
  },
  onFileDelete: async (file: FeatureFile) => {
    await deleteFeatureFile(file.id);
    const state = store.getState();
    if (state.currentFileId === file.id) {
      store.setState({ currentFileId: null, currentFileName: "untitled.feature", dirty: false });
    }
    await refreshFiles();
  },
  onFileRename: async (file: FeatureFile, newName: string) => {
    await renameFeatureFile(file.id, newName);
    const state = store.getState();
    if (state.currentFileId === file.id) {
      store.setState({ currentFileName: newName });
    }
    await refreshFiles();
  },
});

// ── IPC message handling ───────────────────────────────────

ipc.onMessage((msg) => {
  switch (msg.type) {
    case "execute:start":
      store.setState({ featureName: msg.featureName });
      resultsPanel.addFeatureHeader(msg.featureName);
      break;

    case "execute:scenario":
      resultsPanel.addScenarioHeader(msg.scenarioName);
      break;

    case "execute:step":
      resultsPanel.addStepResult(msg.result);
      store.setState({
        stepResults: [...store.getState().stepResults, msg.result],
      });
      break;

    case "execute:done": {
      store.setState({ status: "done", featureResult: msg.result });
      statusBar.setStats(
        msg.result.stats.passed,
        msg.result.stats.failed,
        msg.result.stats.total,
        msg.result.duration,
      );
      // Resolve the queue so next feature can start
      if (executionResolve) {
        const resolve = executionResolve;
        executionResolve = null;
        resolve();
      } else {
        // Single execution (not queued)
        toolbar.setRunning(false);
        scenariosPanel.setRunning(false);
        statusBar.setStatus("done");
        resultsPanel.showSummary(msg.result);
      }
      break;
    }

    case "execute:error":
      store.setState({ status: "error", error: msg.error });
      toolbar.setRunning(false);
      scenariosPanel.setRunning(false);
      statusBar.setStatus("error");
      if (executionResolve) {
        const resolve = executionResolve;
        executionResolve = null;
        resolve();
      }
      break;

    case "execute:cancelled":
      store.setState({ status: "cancelled" });
      toolbar.setRunning(false);
      scenariosPanel.setRunning(false);
      statusBar.setStatus("cancelled");
      if (executionResolve) {
        const resolve = executionResolve;
        executionResolve = null;
        resolve();
      }
      break;

    case "parse:error":
      store.setState({ status: "error", error: msg.errors.map((e) => e.message).join("\n") });
      toolbar.setRunning(false);
      scenariosPanel.setRunning(false);
      statusBar.setStatus("error");
      resultsPanel.show();
      resultsPanel.clear();
      switchTab("results");
      for (const err of msg.errors) {
        resultsPanel.addStepResult({
          step: { keyword: "Parse Error", text: err.message, line: err.line },
          status: "failed",
          error: `Line ${err.line}, Column ${err.column}`,
          duration: 0,
        });
      }
      if (executionResolve) {
        const resolve = executionResolve;
        executionResolve = null;
        resolve();
      }
      break;

    // Lua script management responses
    case "lua:list":
      scriptManager.setScripts(msg.scripts);
      break;

    case "lua:saved":
      ipc.send({ type: "lua:list" });
      break;

    case "lua:deleted":
      ipc.send({ type: "lua:list" });
      break;

    case "lua:toggled":
      ipc.send({ type: "lua:list" });
      break;

    case "lua:error":
      console.error("[Lua]", msg.error);
      console.error("[Lua]", msg.error);
      break;

    case "record:step": {
      if (!store.getState().recording) return;

      const currentContent = editor.getContent();
      // Ensure we append to a new line
      const prefix = currentContent.endsWith("\n") ? "" : "\n";
      // Use 'Given' for the first step (URL open), 'And' for the rest
      const keyword = msg.isFirst ? "Given" : "And";
      const stepLine = `    ${keyword} ${msg.step}`;

      const newContent = `${currentContent}${prefix}${stepLine}`;
      editor.setContent(newContent);
      store.setState({ content: newContent, dirty: true });
      break;
    }
  }
});

// ── Editor change tracking ─────────────────────────────────

editor.onChange((content) => {
  store.setState({ content, dirty: true });
});

// ── Store subscriptions ────────────────────────────────────

store.subscribe((state) => {
  toolbar.setRunning(state.status === "running");
  toolbar.setRecording(state.recording);
  toolbar.setFileName(state.currentFileName, state.dirty);
});

// ── Load saved files ───────────────────────────────────────

async function refreshFiles() {
  const files = await loadFeatureFiles();
  store.setState({ files });
  fileManager.setFiles(files);
}

refreshFiles();

console.log("[Gherkin BDD] Side panel loaded");
