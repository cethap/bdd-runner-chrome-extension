# Architecture & Scaffolding Guide

This document explains how the BDD Runner Chrome Extension is structured, how data flows through the system, and how to maintain and extend it.

---

## Table of Contents

1. [High-Level Overview](#high-level-overview)
2. [Chrome Extension Architecture](#chrome-extension-architecture)
3. [Directory Structure](#directory-structure)
4. [Data Flow](#data-flow)
5. [Entrypoints](#entrypoints)
6. [The IPC Layer](#the-ipc-layer)
7. [The Execution Engine](#the-execution-engine)
8. [The Plugin System](#the-plugin-system)
9. [Browser Automation (CDP)](#browser-automation-cdp)
10. [The Parser](#the-parser)
11. [The Side Panel UI](#the-side-panel-ui)
12. [State Management](#state-management)
13. [Storage](#storage)
14. [Build System & Configuration](#build-system--configuration)
15. [How to Add a New Step Definition](#how-to-add-a-new-step-definition)
16. [How to Add a New Plugin](#how-to-add-a-new-plugin)
17. [How to Add a New UI Tab](#how-to-add-a-new-ui-tab)
18. [Common Pitfalls & Maintenance Notes](#common-pitfalls--maintenance-notes)

---

## High-Level Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Chrome Browser                        │
│                                                         │
│  ┌───────────────┐         ┌──────────────────────────┐ │
│  │  Side Panel    │  IPC    │  Background Service      │ │
│  │  (UI)         │◄───────►│  Worker                  │ │
│  │               │  Port   │                          │ │
│  │  - Editor     │         │  - IpcServer             │ │
│  │  - Scenarios  │         │  - PluginManager         │ │
│  │  - Results    │         │  - StepRegistry          │ │
│  │               │         │  - Executor              │ │
│  └───────────────┘         │  - GherkinParser         │ │
│                            │  - CdpClient             │ │
│                            └──────────┬───────────────┘ │
│                                       │ CDP (debugger)  │
│                              ┌────────▼────────┐        │
│                              │  Active Tab      │        │
│                              │  (web page)      │        │
│                              └─────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

The extension has **two isolated execution contexts** that communicate via Chrome's runtime port messaging:

| Context | File | Role |
|---------|------|------|
| **Side Panel** | `entrypoints/sidepanel/` | UI: editor, scenario browser, results display |
| **Background** | `entrypoints/background.ts` | Engine: parses Gherkin, resolves steps, executes them |

The background service worker has access to the Chrome Debugger API, which it uses to control the active browser tab via Chrome DevTools Protocol (CDP).

---

## Chrome Extension Architecture

### Manifest Permissions

Defined in `wxt.config.ts` → generates `manifest.json`:

| Permission | Purpose |
|------------|---------|
| `sidePanel` | Opens the side panel UI |
| `storage` | Persists feature files and Lua scripts |
| `debugger` | Attaches to tabs for browser automation (CDP) |
| `host_permissions: <all_urls>` | Allows HTTP requests to any domain |

### WXT Framework

We use [WXT](https://wxt.dev) as the Chrome extension framework. It provides:
- **Entrypoint discovery** — files in `entrypoints/` are auto-discovered
- **Vite bundling** — TypeScript, tree-shaking, hot-reload in dev
- **Manifest generation** — `wxt.config.ts` generates the manifest
- **Path aliases** — `@/` maps to the project root

---

## Directory Structure

```
gherkin-extension/
├── entrypoints/                    # Chrome extension entrypoints
│   ├── background.ts               # Service worker (engine runs here)
│   └── sidepanel/                   # Side panel UI
│       ├── index.html               # HTML shell with 3-tab layout
│       ├── main.ts                  # App bootstrap, tab switching, IPC wiring
│       ├── styles.css               # All CSS (Catppuccin dark theme)
│       └── components/              # UI components (vanilla TS, no framework)
│           ├── Editor.ts            # CodeMirror 6 editor
│           ├── FileManager.ts       # File sidebar (list, rename, delete)
│           ├── ResultsPanel.ts      # Execution results with headers
│           ├── ScenariosPanel.ts    # Scenario browser with checkboxes
│           ├── ScriptManager.ts     # Lua script CRUD
│           ├── StatusBar.ts         # Bottom status bar
│           └── Toolbar.ts           # Editor toolbar (Run, Save, New, etc.)
│
├── lib/                             # Shared library code
│   ├── browser/                     # Browser automation
│   │   └── cdp-client.ts            # Chrome DevTools Protocol client
│   │
│   ├── editor/                      # CodeMirror configuration
│   │   ├── gherkin-language.ts      # Gherkin syntax mode
│   │   ├── gherkin-completion.ts    # Autocomplete provider
│   │   └── gherkin-theme.ts         # Catppuccin theme + highlighting
│   │
│   ├── engine/                      # Test execution engine
│   │   ├── types.ts                 # Core types (StepResult, ExecutionContext, etc.)
│   │   ├── executor.ts              # Feature → Scenario → Step runner
│   │   ├── step-registry.ts         # Registry of all step definitions
│   │   ├── step-matcher.ts          # Pattern matching (regex → step handler)
│   │   └── context.ts               # ExecutionContext factory & reset
│   │
│   ├── ipc/                         # Inter-process communication
│   │   ├── messages.ts              # Message type definitions (ClientMessage, ServerMessage)
│   │   ├── client.ts                # Side panel → background (IpcClient)
│   │   └── server.ts                # Background → side panel (IpcServer)
│   │
│   ├── lua/                         # Lua VM integration
│   │   ├── lua-bridge.ts            # Fengari Lua VM wrapper
│   │   ├── lua-stdlib.ts            # Custom stdlib (json, print, ctx access)
│   │   └── types.ts                 # Lua script types
│   │
│   ├── parser/                      # Gherkin parser
│   │   ├── gherkin-parser.ts        # Wraps @cucumber/gherkin
│   │   └── types.ts                 # ParsedFeature, ParsedScenario, etc.
│   │
│   ├── plugins/                     # Plugin system
│   │   ├── plugin-types.ts          # Plugin interface
│   │   ├── plugin-manager.ts        # Loads plugins, lifecycle hooks
│   │   ├── built-in-plugin.ts       # HTTP + assertion + variable steps
│   │   ├── browser-plugin.ts        # Browser automation steps
│   │   └── lua-plugin.ts            # Lua script-defined steps
│   │
│   ├── steps/                       # Step definition implementations
│   │   ├── http-steps.ts            # url, header, param, request, method
│   │   ├── assertion-steps.ts       # match, status
│   │   ├── variable-steps.ts        # def, print
│   │   ├── browser-steps.ts         # browser open, click, fill, text, etc.
│   │   └── lua-steps.ts             # eval, script
│   │
│   ├── storage/                     # Chrome storage wrappers
│   │   ├── feature-storage.ts       # Feature file CRUD
│   │   └── lua-storage.ts           # Lua script CRUD
│   │
│   └── store/                       # Side panel state management
│       ├── store.ts                 # Generic observable Store<T>
│       └── slices/                  # State shape definitions
│           ├── editor-slice.ts      # Editor state (currentFileId, dirty, etc.)
│           ├── execution-slice.ts   # Execution state (status, results, etc.)
│           └── files-slice.ts       # File list state
│
├── wxt.config.ts                    # WXT + Vite config (includes Fengari shims)
├── tsconfig.json                    # TypeScript config
├── package.json                     # Dependencies
└── samples.md                       # Example Gherkin scenarios
```

---

## Data Flow

### Execution Flow (when user clicks "Run")

```
Side Panel                              Background Service Worker
──────────                              ────────────────────────

1. User clicks ▶ Run
   │
2. editor.getContent()
   │
3. ipc.send({ type: "execute",  ──────► 4. IpcServer.handleMessage()
      source: "Feature: ..." })              │
                                         5. parseGherkin(source)
                                              │ → ParsedFeature
                                         6. executeFeature(feature, registry, ...)
                                              │
                                         7. For each scenario:
                                              │  send("execute:scenario")
                                              │  beforeScenario hooks
                                              │  For each step:
                                              │    stepMatcher.match(stepText)
                                              │    handler(ctx, match, docString)
8. ipc.onMessage() ◄──────────────────        │    send("execute:step", result)
   │                                          │  afterScenario hooks
9. resultsPanel.addStepResult()          │
   resultsPanel.addScenarioHeader()      8. send("execute:done", featureResult)
   resultsPanel.addFeatureHeader()
```

### Multi-Feature Queue Flow (Scenarios tab → Run All)

```
1. Group scenarios by feature file
2. For each group:
   a. buildFeatureSource(featureName, items)  → Gherkin source string
   b. ipc.send({ type: "execute", source })
   c. await waitForExecutionDone()            → resolved on "execute:done"
3. After all groups: setRunning(false)
```

This ensures features execute **one at a time** without merging them.

---

## Entrypoints

### `background.ts`

The service worker. This is the **brain** of the extension:

```typescript
const server = new IpcServer();
server.listen();
```

It does three things:
1. Opens the side panel on extension icon click
2. Creates an `IpcServer` that listens for port connections
3. The server lazily initializes the execution engine on first `execute` message

### `sidepanel/`

The HTML + CSS + TypeScript UI that runs in Chrome's side panel. It is a **vanilla TypeScript** app (no React, Vue, etc.) that uses DOM manipulation directly.

---

## The IPC Layer

### Message Flow

```
Side Panel (client.ts)  ◄──── chrome.runtime.Port ────►  Background (server.ts)
```

Messages are typed unions in `lib/ipc/messages.ts`:

| Direction | Message | Purpose |
|-----------|---------|---------|
| Client → Server | `parse` | Parse Gherkin without executing |
| Client → Server | `execute` | Parse + execute a Gherkin source |
| Client → Server | `cancel` | Abort current execution |
| Client → Server | `lua:save/delete/toggle/list/reload` | Lua script management |
| Server → Client | `execute:start` | Feature execution started |
| Server → Client | `execute:scenario` | Scenario started (name, index) |
| Server → Client | `execute:step` | Step completed (result, index) |
| Server → Client | `execute:done` | Feature execution complete |
| Server → Client | `execute:error` | Execution error |
| Server → Client | `execute:cancelled` | Execution was cancelled |
| Server → Client | `parse:success/error` | Parse results |
| Server → Client | `lua:list/saved/deleted/toggled/error` | Lua script responses |

### How it connects

1. Side panel creates a port: `chrome.runtime.connect({ name: "gherkin-runner" })`
2. Background listens: `chrome.runtime.onConnect.addListener()`
3. Both sides use `port.postMessage()` and `port.onMessage.addListener()`

---

## The Execution Engine

Located in `lib/engine/`. This is the core of the system.

### Key Types (`types.ts`)

| Type | Purpose |
|------|---------|
| `ExecutionContext` | The mutable state bag passed to every step handler. Contains `variables`, `url`, `headers`, `response`, `browser`, `prints`, etc. |
| `StepDefinition` | A regex `pattern` + async `handler` function |
| `StepResult` | Outcome of one step: status, error, duration, screenshot, printOutput |
| `ScenarioResult` | Outcome of one scenario: list of StepResults |
| `FeatureResult` | Outcome of one feature: list of ScenarioResults + stats |

### Execution Pipeline (`executor.ts`)

```
executeFeature(feature, registry, signal, onProgress, hooks, onScenarioStart)
  └── for each scenario:
        onScenarioStart(scenario.name, i)
        executeScenario(scenario, backgroundSteps, registry, signal, i, onProgress, hooks)
          └── hooks.beforeScenario(ctx)
              for each step (background + scenario steps):
                matchStep(step.text, registry) → { definition, match }
                definition.handler(ctx, match, step.docString, step.dataTable)
                onProgress(stepResult, scenarioIndex)
              hooks.afterScenario(ctx)
```

### Context Lifecycle

- **Created** per scenario via `createExecutionContext(signal)`
- **Reset** between HTTP requests via `resetRequestState(ctx)` (keeps variables, clears url/headers/body)
- The `browser` field starts as `null` and is set by `BrowserPlugin.beforeScenario()`

### Step Registry (`step-registry.ts`)

A simple array of `StepDefinition` objects. Steps are matched **in order** — first match wins. This is why plugin load order matters:

```typescript
// In IpcServer.initialize():
await pluginManager.loadPlugin(this.luaPlugin);       // 1st: Lua (custom user steps)
await pluginManager.loadPlugin(new BrowserPlugin());   // 2nd: Browser steps
await pluginManager.loadPlugin(new BuiltInHttpPlugin()); // 3rd: HTTP/assertion steps
```

Lua scripts are loaded first so user-defined patterns like `def x = eval` match before the generic built-in `def` pattern.

### Step Matcher (`step-matcher.ts`)

Tries each registered pattern against the step text. Returns the first match with captured groups.

---

## The Plugin System

### Plugin Interface (`plugin-types.ts`)

```typescript
interface Plugin {
  id: string;
  name: string;
  initialize?(): Promise<void>;
  getStepDefinitions(): StepDefinition[];
  beforeScenario?(ctx: ExecutionContext): Promise<void>;
  afterScenario?(ctx: ExecutionContext): Promise<void>;
  destroy?(): Promise<void>;
}
```

### Plugin Manager (`plugin-manager.ts`)

- `loadPlugin(plugin)` — calls `initialize()`, gets step definitions, registers them
- `beforeScenario(ctx)` / `afterScenario(ctx)` — lifecycle hooks called for each scenario
- Plugins are stored in a `Map<id, Plugin>` for lookup

### Built-in Plugins

| Plugin | File | Steps Provided |
|--------|------|---------------|
| `BuiltInHttpPlugin` | `built-in-plugin.ts` | HTTP (url, header, method, status), assertions (match), variables (def, print) |
| `BrowserPlugin` | `browser-plugin.ts` | Browser automation (open, click, fill, text, screenshot, etc.) |
| `LuaPlugin` | `lua-plugin.ts` | eval, script, plus dynamically loaded Lua-defined steps |

### Step Definitions (`lib/steps/`)

Each file exports a function that returns `StepDefinition[]`:

| File | Steps |
|------|-------|
| `http-steps.ts` | `url`, `header`, `param`, `request`, `method` |
| `assertion-steps.ts` | `status`, `match ... == / != / contains` |
| `variable-steps.ts` | `def`, `print` |
| `browser-steps.ts` | `browser open/click/fill/text/value/visible/screenshot/press/wait/scroll/select/check/uncheck/close` |
| `lua-steps.ts` | `eval` (with doc string), `def x = eval`, `script 'name'` |

---

## Browser Automation (CDP)

### Overview

Browser automation uses the **Chrome DevTools Protocol** via `chrome.debugger` API:

```
BrowserPlugin.beforeScenario(ctx) → creates CdpClient → ctx.browser = client
browser-steps.ts → uses ctx.browser.click(), .fill(), .getText(), etc.
BrowserPlugin.afterScenario(ctx) → ctx.browser.disconnect()
```

### CdpClient (`lib/browser/cdp-client.ts`)

The `CdpClient` class wraps the Chrome debugger API:

| Method | CDP Command |
|--------|-------------|
| `attach(tabId)` | `chrome.debugger.attach` |
| `navigate(url)` | `Page.navigate` + wait for `Page.loadEventFired` |
| `click(selector)` | `waitForSelector` → `Runtime.evaluate` (get coords) → `Input.dispatchMouseEvent` |
| `fill(selector, value)` | `click` → clear → type character-by-character via `Input.dispatchKeyEvent` |
| `getText(selector)` | `Runtime.evaluate(el.innerText)` |
| `screenshot()` | `Page.captureScreenshot` |
| `evaluate(expression)` | `Runtime.evaluate` |

### Selector Engine

The `queryExpression(selector)` method auto-detects CSS vs. accessibility selectors:

```
"#login-btn"           → CSS:     document.querySelector("#login-btn")
"button \"Login\""     → A11Y:   (IIFE that walks DOM matching role + accessible name)
```

Detection uses a regex: `/^(button|textbox|link|heading|...)\\s+"(.+)"$/`

The A11Y query JS:
1. Maps the role name to HTML tag names + ARIA role selectors
2. Queries all matching elements
3. Filters by computed accessible name (aria-label → label[for] → textContent → placeholder)
4. Returns the first match

### `waitForSelector` Pattern

All DOM operations use a **polling wait** (10s timeout, 100ms interval):

```typescript
private async waitForSelector(selector: string, timeout = 10000) {
  const query = this.queryExpression(selector);
  // Polls: evaluate(`(${query}) !== null`) until true
  // If context is destroyed (navigation), retries instead of throwing
}
```

---

## The Parser

### `lib/parser/gherkin-parser.ts`

Wraps the `@cucumber/gherkin` parser. Converts Gherkin source text into a `ParsedFeature`:

```typescript
parseGherkin(source: string): ParseResult
// → { ok: true, feature: ParsedFeature }
// → { ok: false, errors: ParseError[] }
```

### Important Constraints

- **One feature per source** — the parser does not support multiple `Feature:` blocks
- Multi-feature execution is handled by the **execution queue** in `main.ts` which sends separate `execute` messages for each feature

### Types (`lib/parser/types.ts`)

```
ParsedFeature
  ├── name, description, tags
  ├── background?: ParsedBackground
  └── scenarios: ParsedScenario[]
        ├── name, tags
        ├── steps: ParsedStep[]
        │     ├── keyword: "Given" | "When" | "Then" | "And"
        │     ├── text: "url 'https://...'"
        │     ├── docString?: "..."
        │     └── dataTable?: string[][]
        └── examples?: ParsedExamples[] (for Scenario Outline)
```

---

## The Side Panel UI

### Tab Layout

```
┌──────────┬────────────┬──────────┐
│  Editor  │ Scenarios  │ Results  │
├──────────┴────────────┴──────────┤
│                                   │
│   Active tab content              │
│                                   │
├───────────────────────────────────┤
│  Status Bar                       │
└───────────────────────────────────┘
```

Tab switching is handled in `main.ts` by toggling `.active` class on `.tab-content` divs.

### Components

All components are **vanilla TypeScript classes** that take a container `HTMLElement` and mutate the DOM directly. No virtual DOM, no framework.

| Component | Container | Responsibility |
|-----------|-----------|----------------|
| `Editor` | `#editor` | CodeMirror 6 instance: Gherkin syntax, autocomplete, Tab indentation |
| `Toolbar` | `#toolbar` | ▶ Run, ■ Stop, 💾 Save, ＋ New, 📁 Files, Lua buttons |
| `FileManager` | `#file-manager` | Lists saved files, rename, delete, click to load |
| `ScenariosPanel` | `#scenarios-panel` | Lists all scenarios from all files with checkboxes, Run All/Selected/Single |
| `ResultsPanel` | `#results-panel` | Feature/scenario headers, step results, screenshots, timing |
| `ScriptManager` | `#script-manager` | Lua script editor: create, edit, toggle, delete |
| `StatusBar` | `#status-bar` | Shows idle/running/done/error + pass/fail/total stats |

### Component Pattern

Each component follows the same pattern:

```typescript
export class MyComponent {
  private container: HTMLElement;

  constructor(container: HTMLElement, callbacks: MyCallbacks) {
    this.container = container;
    // Build initial DOM
  }

  // Public methods to update the UI
  setData(data: SomeType): void {
    this.render(); // re-renders container.innerHTML
  }
}
```

---

## State Management

### Store (`lib/store/store.ts`)

A minimal observable store (no external dependencies):

```typescript
class Store<T> {
  getState(): Readonly<T>
  setState(partial: Partial<T>): void  // merges + notifies
  subscribe(listener: (state: T) => void): () => void
}
```

### State Shape

Composed from three slices:

```typescript
type AppState = EditorState & ExecutionState & FilesState;

// EditorState:
{ currentFileId, currentFileName, content, dirty }

// ExecutionState:
{ status, featureName, stepResults, featureResult, error }

// FilesState:
{ files: FeatureFile[], loading }
```

### State Subscriptions

Only the `Toolbar` subscribes to state changes (to update run/stop button and filename):

```typescript
store.subscribe((state) => {
  toolbar.setRunning(state.status === "running");
  toolbar.setFileName(state.currentFileName, state.dirty);
});
```

Most UI updates happen directly in the IPC message handler (imperative style).

---

## Storage

### Feature Files (`lib/storage/feature-storage.ts`)

Stores feature files in `chrome.storage.local` under the key `gherkin_features`.

```typescript
loadFeatureFiles(): Promise<FeatureFile[]>
saveFeatureFile(name, content, existingId?): Promise<FeatureFile>
deleteFeatureFile(id): Promise<void>
renameFeatureFile(id, newName): Promise<void>
```

Each `FeatureFile` has: `{ id, name, content, createdAt, updatedAt }`

### Lua Scripts (`lib/storage/lua-storage.ts`)

Similar pattern, stored under `gherkin_lua_scripts`.

---

## Build System & Configuration

### `wxt.config.ts`

Contains two important Vite plugins:

1. **`node-module-stubs`** — Replaces Node.js built-in modules (`fs`, `os`, `path`, `crypto`, etc.) with no-op stubs. Required because Fengari (Lua VM) eagerly imports them.

2. **`fengari-process-shim`** — Injects `globalThis.process` and `globalThis.Buffer` shims for browser compatibility.

### Development

```bash
pnpm dev       # Start dev server with hot reload
pnpm build     # Production build
pnpm typecheck # Type checking only
```

The dev output goes to `.output/chrome-mv3-dev/` and the production build to `.output/chrome-mv3/`.

> **Important:** After `pnpm dev` rebuilds, Chrome does hot-reload the side panel JS/CSS but the **background service worker** may need a manual reload from `chrome://extensions`.

---

## How to Add a New Step Definition

**Example:** Add a `browser sleep <ms>` step.

### 1. Add the step to the appropriate steps file

```typescript
// lib/steps/browser-steps.ts
{
  pattern: /^browser sleep (\d+)$/,
  handler: async (ctx, match) => {
    const ms = parseInt(match.groups[0]!, 10);
    await new Promise((resolve) => setTimeout(resolve, ms));
  },
  description: "Sleep for N milliseconds",
}
```

### 2. That's it!

The step file is already imported by its plugin (`browser-plugin.ts` → `getBrowserStepDefinitions()`). The plugin registers all returned steps via the `StepRegistry`.

If you're adding a **new category** of steps (e.g., database steps), see [How to Add a New Plugin](#how-to-add-a-new-plugin).

---

## How to Add a New Plugin

### 1. Create the step definitions file

```typescript
// lib/steps/my-steps.ts
export function getMyStepDefinitions(): StepDefinition[] {
  return [
    {
      pattern: /^my step (.+)$/,
      handler: async (ctx, match) => { /* ... */ },
      description: "Does something",
    },
  ];
}
```

### 2. Create the plugin

```typescript
// lib/plugins/my-plugin.ts
import type { Plugin } from "./plugin-types";
import { getMyStepDefinitions } from "@/lib/steps/my-steps";

export class MyPlugin implements Plugin {
  id = "my-plugin";
  name = "My Plugin";

  getStepDefinitions() {
    return getMyStepDefinitions();
  }

  // Optional lifecycle hooks:
  async beforeScenario(ctx) { /* setup */ }
  async afterScenario(ctx)  { /* cleanup */ }
}
```

### 3. Register it in `IpcServer.initialize()`

```typescript
// lib/ipc/server.ts
await this.pluginManager.loadPlugin(new MyPlugin());
```

> **Order matters!** Earlier plugins match first. Put specific patterns before generic ones.

---

## How to Add a New UI Tab

### 1. Add the tab button and content in `index.html`

```html
<button class="tab-btn" data-tab="mytab">My Tab</button>
...
<div id="tab-mytab" class="tab-content">
  <div id="my-panel"></div>
</div>
```

### 2. Create the component

```typescript
// entrypoints/sidepanel/components/MyPanel.ts
export class MyPanel {
  constructor(container: HTMLElement) { /* ... */ }
  // methods...
}
```

### 3. Wire it up in `main.ts`

```typescript
import { MyPanel } from "./components/MyPanel";
const myPanel = new MyPanel(document.getElementById("my-panel")!);
```

Tab switching is automatic — the `data-tab` attribute matches the `id="tab-{name}"` convention.

---

## Common Pitfalls & Maintenance Notes

### 1. Parser: One Feature Per Source

The Gherkin parser only supports one `Feature:` block per source string. Multi-feature execution uses a **queue** in `main.ts` that sends separate `execute` messages for each feature.

### 2. Step Match Order

Steps are matched first-come-first-served. If two patterns overlap (e.g., `def x = eval` vs `def x = <expr>`), the one registered **first** wins. This is controlled by plugin load order in `IpcServer.initialize()`.

### 3. Background Service Worker Lifecycle

Chrome can **kill** the service worker after inactivity. The `IpcServer` and `StepRegistry` are re-created when the worker restarts. Ensure any state that must persist is stored in `chrome.storage`.

### 4. CDP Context Destruction

When navigating between pages, the DOM execution context is destroyed. The `CdpClient.waitForSelector()` handles this by catching errors and retrying. If you add new CDP-based methods, always use `waitForSelector()` before evaluating DOM expressions.

### 5. Fengari Node.js Stubs

Fengari (the Lua VM) imports Node.js modules at startup. The stubs in `wxt.config.ts` prevent crashes. If you update Fengari or add new Lua libraries, you may need to add more stubs.

### 6. Accessibility Selector Regex

The A11Y selector regex in `CdpClient` must be kept in sync if you add new roles. The supported roles list appears in three places:
- `A11Y_PATTERN` regex (detection)
- `buildA11yQueryJS()` tag map (execution)
- `README.md` documentation

### 7. CSS Variables (Catppuccin Theme)

All colors are defined as CSS custom properties at the top of `styles.css`. To change the theme, modify the `:root` variables. The design uses the [Catppuccin Mocha](https://github.com/catppuccin/catppuccin) palette.

### 8. File Save Deduplication

The save logic in `main.ts` checks for existing files by name when `currentFileId` is null (e.g., after panel reload). This prevents creating duplicate "untitled.feature" files.

---

## Dependency Graph

```
background.ts
  └── IpcServer
        ├── GherkinParser
        ├── PluginManager
        │     ├── LuaPlugin → LuaBridge → Fengari VM
        │     ├── BrowserPlugin → CdpClient → chrome.debugger
        │     └── BuiltInHttpPlugin → fetch()
        ├── StepRegistry
        └── Executor
              ├── StepMatcher
              └── ExecutionContext

sidepanel/main.ts
  ├── IpcClient ──────── chrome.runtime.Port ──────── IpcServer
  ├── Store<AppState>
  ├── Editor (CodeMirror)
  ├── Toolbar
  ├── FileManager ────── FeatureStorage (chrome.storage)
  ├── ScenariosPanel ──── GherkinParser (client-side parsing for listing)
  ├── ResultsPanel
  ├── ScriptManager ───── (IPC to LuaPlugin)
  └── StatusBar
```
