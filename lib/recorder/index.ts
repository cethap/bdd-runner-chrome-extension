// ── Types ────────────────────────────────────────────────────────
export type { RecorderMode, RecorderEvent, SelectorResult } from "./types";

// ── Selector Engine ──────────────────────────────────────────────
export { computeSelector, computeCandidates } from "./selector-engine";

// ── Highlighter ──────────────────────────────────────────────────
export {
    show as highlighterShow,
    showActionPoint as highlighterShowActionPoint,
    hide as highlighterHide,
    destroy as highlighterDestroy,
} from "./highlighter";

// ── Mode Machine ─────────────────────────────────────────────────
export { createModeMachine } from "./mode-machine";
export type { ModeMachine } from "./mode-machine";

// ── Event Handlers ───────────────────────────────────────────────
export { createEventHandlers } from "./event-handlers";
export type { EventHandlerOptions, EventHandlers } from "./event-handlers";
