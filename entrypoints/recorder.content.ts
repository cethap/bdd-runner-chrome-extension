import { createModeMachine } from "@/lib/recorder/mode-machine";
import { createEventHandlers } from "@/lib/recorder/event-handlers";
import * as highlighter from "@/lib/recorder/highlighter";
import type { RecorderMode, RecorderEvent } from "@/lib/recorder/types";

export default defineContentScript({
    matches: ["<all_urls>"],
    allFrames: true,
    runAt: "document_idle",
    main() {
        const isInIframe = window !== window.top;
        const machine = createModeMachine();
        let handlers: ReturnType<typeof createEventHandlers> | null = null;
        let overlay: HTMLDivElement | null = null;
        let stepCount = 0;

        // ── Frame identification ──────────────────────────────────
        function getFrameSelector(): string | null {
            if (!isInIframe) return null;
            try {
                // Ask the parent to identify us — but cross-origin blocks this.
                // Fallback: use our own URL or frame name.
                const frameName = window.name;
                if (frameName) return `iframe[name="${frameName}"]`;

                // Try frameElement (works same-origin only)
                const fe = window.frameElement as HTMLIFrameElement | null;
                if (fe) {
                    if (fe.title) return `iframe[title="${fe.title}"]`;
                    if (fe.id) return `iframe[id="${fe.id}"]`;
                    if (fe.name) return `iframe[name="${fe.name}"]`;
                    if (fe.src) {
                        try {
                            const url = new URL(fe.src, location.href);
                            return `iframe[src*="${url.pathname}"]`;
                        } catch { /* ignore */ }
                    }
                }

                // Last resort: use our URL
                return `iframe[src*="${location.pathname}"]`;
            } catch {
                return `iframe[src*="${location.pathname}"]`;
            }
        }

        const frameSelector = getFrameSelector();

        // ── Callbacks ───────────────────────────────────────────
        function sendStep(step: string) {
            console.log(`[Gherkin Recorder${isInIframe ? " (iframe)" : ""}] Step:`, step);
            if (!isInIframe) updateOverlay(step);
            // Include frame context so the background/sidepanel knows
            chrome.runtime.sendMessage({
                type: "record:step",
                step,
                frameSelector: frameSelector ?? undefined,
            });
        }

        function onSelectorResult(result: { selector: string; candidates: import("@/lib/a11y/types").SelectorCandidate[] }) {
            chrome.runtime.sendMessage({
                type: "recorder:inspected",
                selector: result.selector,
                alternatives: result.candidates,
            });
        }

        // ── Mode → RecorderEvent mapping ────────────────────────
        const MODE_TO_EVENT: Record<RecorderMode, RecorderEvent> = {
            idle: { type: "STOP" },
            recording: { type: "START_RECORDING" },
            inspecting: { type: "START_INSPECTING" },
            "assert-text": { type: "START_ASSERT_TEXT" },
            "assert-visibility": { type: "START_ASSERT_VISIBILITY" },
            "assert-value": { type: "START_ASSERT_VALUE" },
        };

        // ── Start / Stop ────────────────────────────────────────
        function startRecording() {
            if (machine.currentMode !== "idle") return;

            handlers = createEventHandlers({
                onStep: sendStep,
                onSelectorResult,
                getMode: () => machine.currentMode,
            });

            machine.transition({ type: "START_RECORDING" });
            handlers.attach();
            stepCount = 0;
            if (!isInIframe) createOverlay();
            console.log(`[Gherkin Recorder${isInIframe ? " (iframe)" : ""}] Started`);
        }

        function stopRecording() {
            machine.transition({ type: "STOP" });
            handlers?.detach();
            handlers = null;
            highlighter.destroy();
            if (!isInIframe) removeOverlay();
            console.log(`[Gherkin Recorder${isInIframe ? " (iframe)" : ""}] Stopped`);
        }

        function switchMode(mode: RecorderMode) {
            const event = MODE_TO_EVENT[mode];
            if (event) {
                machine.transition(event);
            }
        }

        // ── Message listener ────────────────────────────────────
        chrome.runtime.onMessage.addListener((message) => {
            if (message.type === "record:start") {
                startRecording();
            } else if (message.type === "record:stop") {
                stopRecording();
            } else if (message.type === "recorder:mode") {
                switchMode(message.mode as RecorderMode);
            }
        });

        // ── Recording overlay ───────────────────────────────────
        function createOverlay() {
            overlay = document.createElement("div");
            overlay.id = "gherkin-recorder-overlay";
            overlay.style.cssText = `
                position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
                background: linear-gradient(135deg, rgba(20,20,30,0.92), rgba(40,10,20,0.92));
                color: #fff; padding: 12px 20px; border-radius: 16px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 13px; font-weight: 500; pointer-events: none;
                display: flex; flex-direction: column; gap: 4px;
                backdrop-filter: blur(12px); border: 1px solid rgba(255,60,60,0.3);
                box-shadow: 0 8px 32px rgba(0,0,0,0.4); max-width: 350px;
            `;
            overlay.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;">
                    <div id="gherkin-rec-dot" style="width:8px;height:8px;background:#ff3c3c;border-radius:50%;box-shadow:0 0 6px #ff3c3c;animation:gherkin-blink 1.2s ease-in-out infinite;"></div>
                    <span>Recording… <span id="gherkin-rec-count" style="opacity:0.6">(0 steps)</span></span>
                </div>
                <div id="gherkin-rec-last" style="font-size:11px;opacity:0.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:310px;"></div>
            `;

            const style = document.createElement("style");
            style.id = "gherkin-recording-style";
            style.textContent = `@keyframes gherkin-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }`;
            document.head.appendChild(style);
            document.body.appendChild(overlay);
        }

        function removeOverlay() {
            overlay?.remove();
            overlay = null;
            document.getElementById("gherkin-recording-style")?.remove();
        }

        function updateOverlay(step: string) {
            stepCount++;
            const countEl = document.getElementById("gherkin-rec-count");
            const lastEl = document.getElementById("gherkin-rec-last");
            if (countEl) countEl.textContent = `(${stepCount} step${stepCount !== 1 ? "s" : ""})`;
            if (lastEl) lastEl.textContent = step;
        }
    },
});
