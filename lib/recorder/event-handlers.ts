import type { RecorderMode, SelectorResult } from "./types";
import type { SelectorCandidate } from "@/lib/a11y/types";
import { computeSelector, computeCandidates } from "./selector-engine";
import * as highlighter from "./highlighter";

// ── Types ────────────────────────────────────────────────────────
export interface EventHandlerOptions {
    /** Called to emit a recorded Gherkin step. */
    onStep: (step: string) => void;
    /** Called when inspecting mode selects an element. */
    onSelectorResult?: (result: SelectorResult) => void;
    /** Returns the current recorder mode. */
    getMode: () => RecorderMode;
}

export interface EventHandlers {
    /** Attach all DOM event listeners. */
    attach(): void;
    /** Detach all DOM event listeners and clean up. */
    detach(): void;
}

// ── Constants ────────────────────────────────────────────────────
const DEBOUNCE_MS = 300;
const NON_TEXT_TYPES = new Set([
    "checkbox", "radio", "submit", "button", "reset", "file", "image", "hidden",
]);
const RECORDABLE_KEYS = new Set([
    "Enter", "Tab", "Escape", "Backspace", "Delete",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
]);

// ── Right-click alternatives panel (Shadow DOM) ──────────────────
let altHost: HTMLDivElement | null = null;
let altShadow: ShadowRoot | null = null;
let altPanel: HTMLDivElement | null = null;

function showAlternativesPanel(x: number, y: number, candidates: SelectorCandidate[], onPick: (sel: string) => void): void {
    hideAlternativesPanel();

    altHost = document.createElement("div");
    altHost.id = "gherkin-alt-host";
    altHost.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;";
    document.body.appendChild(altHost);
    altShadow = altHost.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
        .alt-panel {
            position: fixed;
            background: rgba(15, 15, 25, 0.95);
            border: 1px solid rgba(127, 219, 202, 0.3);
            border-radius: 8px;
            padding: 6px 0;
            font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
            font-size: 12px;
            color: #e0e0e0;
            box-shadow: 0 8px 24px rgba(0,0,0,0.5);
            backdrop-filter: blur(12px);
            max-width: 460px;
            z-index: 1;
        }
        .alt-item {
            padding: 6px 14px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            gap: 12px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .alt-item:hover {
            background: rgba(127, 219, 202, 0.15);
        }
        .alt-selector {
            color: #7fdbca;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .alt-strategy {
            color: rgba(255,255,255,0.4);
            font-size: 10px;
            flex-shrink: 0;
        }
    `;
    altShadow.appendChild(style);

    altPanel = document.createElement("div");
    altPanel.className = "alt-panel";
    altPanel.style.left = `${Math.min(x, window.innerWidth - 470)}px`;
    altPanel.style.top = `${Math.min(y, window.innerHeight - 200)}px`;

    const top5 = candidates.slice(0, 5);
    for (const c of top5) {
        const item = document.createElement("div");
        item.className = "alt-item";
        item.innerHTML = `
            <span class="alt-selector">${escapeHtml(c.selector)}</span>
            <span class="alt-strategy">${c.strategy} (${c.score})</span>
        `;
        item.addEventListener("click", (e) => {
            e.stopPropagation();
            onPick(c.selector);
            hideAlternativesPanel();
        });
        altPanel.appendChild(item);
    }

    altShadow.appendChild(altPanel);

    // Close panel on next click anywhere — consume the event so it doesn't
    // trigger handleClick and record an unwanted step
    const closeHandler = (e: MouseEvent) => {
        e.stopImmediatePropagation();
        e.preventDefault();
        hideAlternativesPanel();
        document.removeEventListener("click", closeHandler, true);
    };
    // Delay to avoid catching the same right-click
    setTimeout(() => document.addEventListener("click", closeHandler, true), 0);
}

function hideAlternativesPanel(): void {
    if (altHost) {
        altHost.remove();
        altHost = null;
        altShadow = null;
        altPanel = null;
    }
}

function escapeHtml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Shadow DOM deep target ────────────────────────────────────────
const OWN_HOST_IDS = new Set(["gherkin-highlighter-host", "gherkin-alt-host", "gherkin-recorder-overlay"]);

function deepEventTarget(event: Event): HTMLElement | null {
    const path = event.composedPath();
    // Walk the composed path to find the deepest HTMLElement that is NOT
    // inside our own Shadow DOM hosts.
    for (const node of path) {
        // ShadowRoot boundaries: if the host is ours, the whole subtree is ours
        if (node instanceof ShadowRoot) {
            const hostId = (node.host as HTMLElement)?.id ?? "";
            if (OWN_HOST_IDS.has(hostId)) return null;
            continue;
        }
        if (!(node instanceof HTMLElement)) continue;
        // If this node IS one of our hosts, skip the event
        if (OWN_HOST_IDS.has(node.id)) return null;
        // First HTMLElement that isn't ours → return it
        return node;
    }
    return null;
}

// ── Factory ──────────────────────────────────────────────────────
export function createEventHandlers(options: EventHandlerOptions): EventHandlers {
    const { onStep, onSelectorResult, getMode } = options;

    // Debounce state
    const inputTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

    // Throttle state for mousemove (requestAnimationFrame)
    let rafId: number | null = null;
    let pendingTarget: HTMLElement | null = null;

    // ── Per-mode dispatch ────────────────────────────────────────

    function handleClick(event: MouseEvent): void {
        const mode = getMode();
        if (mode === "idle") return;

        const target = deepEventTarget(event);
        if (!target || isOwnUI(target)) return;

        try {
            const selector = computeSelector(target);

            switch (mode) {
                case "recording": {
                    highlighter.showActionPoint(event.clientX, event.clientY);

                    // Detect <a> link clicks that navigate
                    const link = target.closest("a[href]") as HTMLAnchorElement | null;
                    if (link?.href && !link.href.startsWith("javascript:") && link.href !== window.location.href && !link.href.startsWith("#")) {
                        onStep(`browser navigate to '${link.href}'`);
                        return;
                    }
                    onStep(`browser click '${selector}'`);
                    break;
                }
                case "inspecting": {
                    // Emit selector result, do NOT generate step
                    if (onSelectorResult) {
                        onSelectorResult({
                            selector,
                            candidates: computeCandidates(target),
                            element: target,
                        });
                    }
                    break;
                }
                case "assert-text": {
                    const text = target.textContent?.trim() ?? "";
                    onStep(`browser text '${selector}' should be '${text}'`);
                    break;
                }
                case "assert-visibility": {
                    onStep(`browser visible '${selector}'`);
                    break;
                }
                case "assert-value": {
                    const value = (target as HTMLInputElement).value ?? target.textContent?.trim() ?? "";
                    onStep(`browser value '${selector}' should be '${value}'`);
                    break;
                }
            }
        } catch (err) {
            console.warn("[Gherkin Recorder] Click handler error:", err);
        }
    }

    function handleInput(event: Event): void {
        if (getMode() !== "recording") return;

        const target = deepEventTarget(event) as HTMLInputElement | HTMLTextAreaElement | null;
        if (!target) return;
        if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") return;

        const type = (target as HTMLInputElement).type?.toLowerCase() || "text";
        if (NON_TEXT_TYPES.has(type)) return;

        // Debounce
        const existing = inputTimers.get(target);
        if (existing) clearTimeout(existing);

        inputTimers.set(target, setTimeout(() => {
            inputTimers.delete(target);
            try {
                const selector = computeSelector(target);
                onStep(`browser fill '${selector}' with '${target.value}'`);
            } catch (err) {
                console.warn("[Gherkin Recorder] Input handler error:", err);
            }
        }, DEBOUNCE_MS));
    }

    function handleChange(event: Event): void {
        if (getMode() !== "recording") return;

        const target = deepEventTarget(event);
        if (!target) return;

        try {
            if (target.tagName === "SELECT") {
                const selector = computeSelector(target);
                const value = (target as HTMLSelectElement).value;
                onStep(`browser select '${selector}' value '${value}'`);
            } else if (target.tagName === "INPUT") {
                const inputEl = target as HTMLInputElement;
                if (inputEl.type === "checkbox") {
                    const selector = computeSelector(target);
                    onStep(inputEl.checked ? `browser check '${selector}'` : `browser uncheck '${selector}'`);
                }
            }
        } catch (err) {
            console.warn("[Gherkin Recorder] Change handler error:", err);
        }
    }

    function handleKeyDown(event: KeyboardEvent): void {
        if (getMode() !== "recording") return;
        if (RECORDABLE_KEYS.has(event.key)) {
            onStep(`browser press '${event.key}'`);
        }
    }

    function handleMouseMove(event: MouseEvent): void {
        const mode = getMode();
        if (mode === "idle") return;

        // Resolve target NOW — composedPath() is only valid during dispatch
        const resolved = deepEventTarget(event);
        if (!resolved || isOwnUI(resolved)) {
            pendingTarget = null;
            return;
        }
        // Don't highlight iframes — the iframe's own content script handles it
        if (resolved.tagName === "IFRAME") {
            pendingTarget = null;
            highlighter.hide();
            return;
        }
        pendingTarget = resolved;

        // Throttle the expensive work via requestAnimationFrame
        if (rafId !== null) return;

        rafId = requestAnimationFrame(() => {
            rafId = null;
            const target = pendingTarget;
            if (!target) {
                highlighter.hide();
                return;
            }

            try {
                const candidates = computeCandidates(target);
                const best = candidates[0];
                if (!best) {
                    highlighter.hide();
                    return;
                }
                const isUnique = best.strategy !== "css-path" && best.score < 10000;
                const top3 = candidates.slice(0, 3).map(c => ({ selector: c.selector, strategy: c.strategy }));
                highlighter.show(target, top3, isUnique);
            } catch (err) {
                console.warn("[Gherkin Recorder] Selector error:", err);
                highlighter.hide();
            }
        });
    }

    function handleMouseLeave(): void {
        // When mouse leaves the document (exits an iframe), hide highlight
        pendingTarget = null;
        highlighter.hide();
    }

    function handleContextMenu(event: MouseEvent): void {
        const mode = getMode();
        if (mode === "idle") return;

        event.preventDefault();

        const target = deepEventTarget(event);
        if (!target || isOwnUI(target)) return;

        try {
            const candidates = computeCandidates(target);
            showAlternativesPanel(event.clientX, event.clientY, candidates, (sel) => {
                // When user picks an alternative, use it as the step selector
                if (mode === "recording") {
                    onStep(`browser click '${sel}'`);
                } else if (mode === "inspecting" && onSelectorResult) {
                    onSelectorResult({ selector: sel, candidates, element: target });
                } else if (mode === "assert-text") {
                    const text = target.textContent?.trim() ?? "";
                    onStep(`browser text '${sel}' should be '${text}'`);
                } else if (mode === "assert-visibility") {
                    onStep(`browser visible '${sel}'`);
                } else if (mode === "assert-value") {
                    const value = (target as HTMLInputElement).value ?? target.textContent?.trim() ?? "";
                    onStep(`browser value '${sel}' should be '${value}'`);
                }
            });
        } catch (err) {
            console.warn("[Gherkin Recorder] Context menu error:", err);
        }
    }

    // ── Helpers ──────────────────────────────────────────────────
    function isOwnUI(el: HTMLElement): boolean {
        // Check in normal DOM
        if (el.closest("#gherkin-highlighter-host") ||
            el.closest("#gherkin-alt-host") ||
            el.closest("#gherkin-recorder-overlay")) return true;
        // Check if we're inside one of our shadow roots
        const root = el.getRootNode();
        if (root instanceof ShadowRoot && OWN_HOST_IDS.has((root.host as HTMLElement)?.id ?? "")) return true;
        return false;
    }

    // ── Public API ──────────────────────────────────────────────
    return {
        attach(): void {
            document.addEventListener("click", handleClick, true);
            document.addEventListener("input", handleInput, true);
            document.addEventListener("change", handleChange, true);
            document.addEventListener("keydown", handleKeyDown, true);
            document.addEventListener("mousemove", handleMouseMove, true);
            document.addEventListener("mouseleave", handleMouseLeave);
            document.addEventListener("contextmenu", handleContextMenu, true);
        },

        detach(): void {
            document.removeEventListener("click", handleClick, true);
            document.removeEventListener("input", handleInput, true);
            document.removeEventListener("change", handleChange, true);
            document.removeEventListener("keydown", handleKeyDown, true);
            document.removeEventListener("mousemove", handleMouseMove, true);
            document.removeEventListener("mouseleave", handleMouseLeave);
            document.removeEventListener("contextmenu", handleContextMenu, true);

            // Clean up debounce timers
            for (const timer of inputTimers.values()) clearTimeout(timer);
            inputTimers.clear();

            // Cancel any pending rAF
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            pendingTarget = null;

            // Clean up UI
            highlighter.hide();
            hideAlternativesPanel();
        },
    };
}
