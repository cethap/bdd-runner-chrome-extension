// ── Colors ────────────────────────────────────────────────────────
const COLOR_UNIQUE = "#2563eb"; // blue
const COLOR_MULTIPLE = "#ea580c"; // orange

// ── Highlighter (Shadow DOM based) ───────────────────────────────
let shadowHost: HTMLDivElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let overlayEl: HTMLDivElement | null = null;
let tooltipEl: HTMLDivElement | null = null;
let actionPointEl: HTMLDivElement | null = null;

function ensureShadowRoot(): ShadowRoot {
    if (shadowRoot) return shadowRoot;

    shadowHost = document.createElement("div");
    shadowHost.id = "gherkin-highlighter-host";
    shadowHost.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
    document.body.appendChild(shadowHost);
    shadowRoot = shadowHost.attachShadow({ mode: "open" });

    // Inject base styles into shadow root
    const style = document.createElement("style");
    style.textContent = `
        * { box-sizing: border-box; }
        .gherkin-overlay {
            position: fixed;
            pointer-events: none;
            border: 2px solid ${COLOR_UNIQUE};
            background: rgba(37, 99, 235, 0.1);
            border-radius: 3px;
            transition: all 0.05s ease-out;
            z-index: 1;
        }
        .gherkin-overlay.multiple {
            border-color: ${COLOR_MULTIPLE};
            background: rgba(234, 88, 12, 0.1);
        }
        .gherkin-tooltip {
            position: fixed;
            pointer-events: none;
            background: rgba(0, 0, 0, 0.88);
            color: #7fdbca;
            padding: 4px 10px;
            border-radius: 6px;
            font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
            font-size: 11px;
            max-width: min(420px, calc(100vw - 8px));
            overflow: hidden;
            backdrop-filter: blur(8px);
            border: 1px solid rgba(127, 219, 202, 0.2);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 2;
            display: flex;
            flex-direction: column;
        }
        .gherkin-tooltip-line {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .gherkin-tooltip-alt {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 10px;
            opacity: 0.5;
        }
        .gherkin-tooltip-alt .gherkin-tooltip-strategy {
            color: rgba(255, 255, 255, 0.4);
            margin-right: 6px;
        }
        .gherkin-action-point {
            position: fixed;
            pointer-events: none;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: ${COLOR_UNIQUE};
            border: 2px solid #fff;
            box-shadow: 0 0 6px rgba(37, 99, 235, 0.6);
            transform: translate(-50%, -50%);
            z-index: 3;
            transition: opacity 0.15s;
        }
    `;
    shadowRoot.appendChild(style);

    // Create elements
    overlayEl = document.createElement("div");
    overlayEl.className = "gherkin-overlay";
    overlayEl.style.display = "none";
    shadowRoot.appendChild(overlayEl);

    tooltipEl = document.createElement("div");
    tooltipEl.className = "gherkin-tooltip";
    tooltipEl.style.display = "none";
    shadowRoot.appendChild(tooltipEl);

    actionPointEl = document.createElement("div");
    actionPointEl.className = "gherkin-action-point";
    actionPointEl.style.display = "none";
    shadowRoot.appendChild(actionPointEl);

    return shadowRoot;
}

/**
 * Show the highlight overlay around an element.
 * @param el - Target element to highlight
 * @param candidates - Top selector candidates (up to 3) with strategy names
 * @param unique - Whether the best selector matches exactly one element
 */
export function show(el: HTMLElement, candidates: { selector: string; strategy: string }[], unique: boolean): void {
    ensureShadowRoot();
    if (!overlayEl || !tooltipEl) return;

    const rect = el.getBoundingClientRect();

    // Overlay
    overlayEl.style.display = "block";
    overlayEl.style.top = `${rect.top}px`;
    overlayEl.style.left = `${rect.left}px`;
    overlayEl.style.width = `${rect.width}px`;
    overlayEl.style.height = `${rect.height}px`;
    overlayEl.classList.toggle("multiple", !unique);

    // Update color-dependent styles
    const color = unique ? COLOR_UNIQUE : COLOR_MULTIPLE;
    const [r, g, b] = hexToRgb(color);
    overlayEl.style.borderColor = color;
    overlayEl.style.background = `rgba(${r}, ${g}, ${b}, 0.1)`;

    // Tooltip — smart positioning that adapts to viewport (especially small iframes)
    tooltipEl.innerHTML = "";
    // Primary candidate
    const first = candidates[0];
    if (first) {
        const primary = document.createElement("div");
        primary.className = "gherkin-tooltip-line";
        primary.textContent = first.selector;
        tooltipEl.appendChild(primary);
    }
    // Alternative candidates (2nd, 3rd)
    for (let i = 1; i < candidates.length; i++) {
        const c = candidates[i];
        if (!c) continue;
        const alt = document.createElement("div");
        alt.className = "gherkin-tooltip-alt";
        const strategySpan = document.createElement("span");
        strategySpan.className = "gherkin-tooltip-strategy";
        strategySpan.textContent = c.strategy;
        alt.appendChild(strategySpan);
        alt.appendChild(document.createTextNode(c.selector));
        tooltipEl.appendChild(alt);
    }
    tooltipEl.style.display = "flex";
    // Reset position so we can measure natural size
    tooltipEl.style.top = "0";
    tooltipEl.style.left = "0";

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tt = tooltipEl.getBoundingClientRect();
    const ttW = Math.min(tt.width, vw - 8);
    const ttH = tt.height;
    const pad = 4; // minimum gap from viewport edges
    const gap = 6; // gap between element and tooltip

    // ── Vertical: prefer above → below → overlay bottom of element
    let tooltipY: number;
    if (rect.top - gap - ttH >= pad) {
        // Fits above
        tooltipY = rect.top - gap - ttH;
    } else if (rect.bottom + gap + ttH <= vh - pad) {
        // Fits below
        tooltipY = rect.bottom + gap;
    } else {
        // Neither fits — pin to top or bottom of viewport, whichever is closer
        tooltipY = rect.top > vh - rect.bottom
            ? Math.max(pad, rect.top - gap - ttH)
            : Math.min(vh - pad - ttH, rect.bottom + gap);
    }

    // ── Horizontal: align to element left, clamped to viewport
    const tooltipX = Math.max(pad, Math.min(rect.left, vw - ttW - pad));

    tooltipEl.style.top = `${tooltipY}px`;
    tooltipEl.style.left = `${tooltipX}px`;
}

/**
 * Show a small action-point circle at click coordinates.
 */
export function showActionPoint(x: number, y: number): void {
    ensureShadowRoot();
    if (!actionPointEl) return;

    actionPointEl.style.display = "block";
    actionPointEl.style.left = `${x}px`;
    actionPointEl.style.top = `${y}px`;

    // Auto-hide after 600ms
    setTimeout(() => {
        if (actionPointEl) actionPointEl.style.display = "none";
    }, 600);
}

/**
 * Hide overlay and tooltip (but keep shadow root alive).
 */
export function hide(): void {
    if (overlayEl) overlayEl.style.display = "none";
    if (tooltipEl) tooltipEl.style.display = "none";
}

/**
 * Fully remove the shadow host from the DOM.
 */
export function destroy(): void {
    if (shadowHost) {
        shadowHost.remove();
        shadowHost = null;
        shadowRoot = null;
        overlayEl = null;
        tooltipEl = null;
        actionPointEl = null;
    }
}

// ── Helpers ──────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace("#", "");
    return [
        parseInt(h.substring(0, 2), 16),
        parseInt(h.substring(2, 4), 16),
        parseInt(h.substring(4, 6), 16),
    ];
}
