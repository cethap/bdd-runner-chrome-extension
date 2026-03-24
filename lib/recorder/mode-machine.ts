import type { RecorderMode, RecorderEvent } from "./types";

// ── Valid transitions table ──────────────────────────────────────
// Key = current mode, Value = set of events that are valid from that mode
const TRANSITIONS: Record<RecorderMode, Partial<Record<RecorderEvent["type"], RecorderMode>>> = {
    idle: {
        START_RECORDING: "recording",
        START_INSPECTING: "inspecting",
    },
    recording: {
        STOP: "idle",
        START_INSPECTING: "inspecting",
        START_ASSERT_TEXT: "assert-text",
        START_ASSERT_VISIBILITY: "assert-visibility",
        START_ASSERT_VALUE: "assert-value",
    },
    inspecting: {
        STOP: "idle",
        RESUME_RECORDING: "recording",
        START_RECORDING: "recording",
    },
    "assert-text": {
        STOP: "idle",
        RESUME_RECORDING: "recording",
        START_RECORDING: "recording",
    },
    "assert-visibility": {
        STOP: "idle",
        RESUME_RECORDING: "recording",
        START_RECORDING: "recording",
    },
    "assert-value": {
        STOP: "idle",
        RESUME_RECORDING: "recording",
        START_RECORDING: "recording",
    },
};

export interface ModeMachine {
    /** Current mode of the recorder. */
    readonly currentMode: RecorderMode;

    /**
     * Attempt a transition. Idempotent — if the resulting mode is
     * the same as the current mode, the callback does NOT fire.
     * Returns the new mode (or current if no-op / invalid).
     */
    transition(event: RecorderEvent): RecorderMode;

    /** Register a listener that fires on every actual mode change. */
    onModeChange(callback: (mode: RecorderMode, prev: RecorderMode) => void): () => void;
}

/**
 * Factory: create a new mode machine starting in `idle`.
 */
export function createModeMachine(): ModeMachine {
    let mode: RecorderMode = "idle";
    const listeners = new Set<(mode: RecorderMode, prev: RecorderMode) => void>();

    return {
        get currentMode(): RecorderMode {
            return mode;
        },

        transition(event: RecorderEvent): RecorderMode {
            const table = TRANSITIONS[mode];
            const nextMode = table?.[event.type];

            if (!nextMode) {
                // Invalid transition — stay in current mode
                return mode;
            }

            if (nextMode === mode) {
                // Idempotent — same state, no-op
                return mode;
            }

            const prev = mode;
            mode = nextMode;

            for (const cb of listeners) {
                cb(mode, prev);
            }

            return mode;
        },

        onModeChange(callback: (mode: RecorderMode, prev: RecorderMode) => void): () => void {
            listeners.add(callback);
            return () => listeners.delete(callback);
        },
    };
}
