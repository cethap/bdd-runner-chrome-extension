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

// ── Helper: build feature source from scenario items ───────

function buildFeatureSource(items: ScenarioItem[]): string {
  // Merge all scenarios into one feature (parser only supports 1 feature per source)
  const parts: string[] = [];
  parts.push(`Feature: Test Suite\n`);
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

// ── Scenarios Panel ────────────────────────────────────────

const scenariosPanel = new ScenariosPanel(document.getElementById("scenarios-panel")!, {
  onRunAll: () => {
    // Parse all files into scenario items and run them all
    const files = store.getState().files;
    const allItems: ScenarioItem[] = [];
    for (const file of files) {

      const result = parseGherkin(file.content);
      if (!result.ok) continue;
      for (const scenario of result.feature.scenarios) {
        allItems.push({
          fileId: file.id,
          fileName: file.name,
          featureName: result.feature.name,
          scenario,
          selected: true,
        });
      }
    }
    const source = buildFeatureSource(allItems);
    startExecution(source);
  },
  onRunSelected: (items: ScenarioItem[]) => {
    const source = buildFeatureSource(items);
    startExecution(source);
  },
  onRunSingle: (item: ScenarioItem) => {
    const source = buildFeatureSource([item]);
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
      break;

    case "execute:step":
      resultsPanel.addStepResult(msg.result);
      store.setState({
        stepResults: [...store.getState().stepResults, msg.result],
      });
      break;

    case "execute:done":
      store.setState({ status: "done", featureResult: msg.result });
      toolbar.setRunning(false);
      scenariosPanel.setRunning(false);
      statusBar.setStatus("done");
      statusBar.setStats(
        msg.result.stats.passed,
        msg.result.stats.failed,
        msg.result.stats.total,
        msg.result.duration,
      );
      resultsPanel.showSummary(msg.result);
      break;

    case "execute:error":
      store.setState({ status: "error", error: msg.error });
      toolbar.setRunning(false);
      scenariosPanel.setRunning(false);
      statusBar.setStatus("error");
      break;

    case "execute:cancelled":
      store.setState({ status: "cancelled" });
      toolbar.setRunning(false);
      scenariosPanel.setRunning(false);
      statusBar.setStatus("cancelled");
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
      break;
  }
});

// ── Editor change tracking ─────────────────────────────────

editor.onChange((content) => {
  store.setState({ content, dirty: true });
});

// ── Store subscriptions ────────────────────────────────────

store.subscribe((state) => {
  toolbar.setRunning(state.status === "running");
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
