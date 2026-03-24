import type { SelectorCandidate } from "@/lib/a11y/types";

// ── Recorder Modes ───────────────────────────────────────────────
export type RecorderMode =
    | "idle"
    | "recording"
    | "inspecting"
    | "assert-text"
    | "assert-visibility"
    | "assert-value";

// ── Selector Result (emitted by inspecting mode / right-click panel) ─
export interface SelectorResult {
    selector: string;
    candidates: SelectorCandidate[];
    element: HTMLElement;
}

// ── Recorder Events (used by mode machine transitions) ───────────
export type RecorderEvent =
    | { type: "START_RECORDING" }
    | { type: "STOP" }
    | { type: "START_INSPECTING" }
    | { type: "START_ASSERT_TEXT" }
    | { type: "START_ASSERT_VISIBILITY" }
    | { type: "START_ASSERT_VALUE" }
    | { type: "RESUME_RECORDING" };
