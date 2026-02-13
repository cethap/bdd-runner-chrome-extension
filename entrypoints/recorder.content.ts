

export default defineContentScript({
    matches: ["<all_urls>"],
    main() {
        let isRecording = false;

        // Listen for messages from background
        chrome.runtime.onMessage.addListener((message) => {
            console.log("[Gherkin Recorder] Received message:", message);
            if (message.type === "record:start") {
                startRecording();
            } else if (message.type === "record:stop") {
                stopRecording();
            }
        });

        let overlay: HTMLDivElement | null = null;
        let tooltip: HTMLDivElement | null = null;
        let stepCount = 0;

        // ── Debounce state ─────────────────────────────────────────
        const inputTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
        const DEBOUNCE_MS = 300;

        // ── A11Y role mapping (mirrors CdpClient) ──────────────────
        const ROLE_TAG_MAP: Record<string, string[]> = {
            button: ["button", '[role="button"]', 'input[type="button"]', 'input[type="submit"]', 'input[type="reset"]'],
            textbox: ['input:not([type])', 'input[type="text"]', 'input[type="email"]', 'input[type="password"]', 'input[type="search"]', 'input[type="tel"]', 'input[type="url"]', 'input[type="number"]', "textarea", '[role="textbox"]'],
            link: ["a[href]", '[role="link"]'],
            heading: ["h1", "h2", "h3", "h4", "h5", "h6", '[role="heading"]'],
            checkbox: ['input[type="checkbox"]', '[role="checkbox"]'],
            radio: ['input[type="radio"]', '[role="radio"]'],
            combobox: ["select", '[role="combobox"]', '[role="listbox"]'],
            option: ["option", '[role="option"]'],
            menuitem: ['[role="menuitem"]'],
            tab: ['[role="tab"]'],
            img: ["img", '[role="img"]'],
            list: ["ul", "ol", '[role="list"]'],
            navigation: ["nav", '[role="navigation"]'],
            form: ["form", '[role="form"]'],
            region: ['section[aria-label]', '[role="region"]'],
        };

        // Reverse map: given a tagName + attributes, find the role
        function detectRole(el: HTMLElement): string | null {
            const tag = el.tagName.toLowerCase();
            const role = el.getAttribute("role");

            // Explicit ARIA role
            if (role) {
                for (const [roleName, selectors] of Object.entries(ROLE_TAG_MAP)) {
                    if (selectors.some((s) => s === `[role="${role}"]`)) return roleName;
                }
            }

            // Implicit role by tag
            if (tag === "button") return "button";
            if (tag === "a" && el.hasAttribute("href")) return "link";
            if (tag === "select") return "combobox";
            if (tag === "option") return "option";
            if (tag === "textarea") return "textbox";
            if (tag === "nav") return "navigation";
            if (tag === "form") return "form";
            if (tag === "img") return "img";
            if (tag === "ul" || tag === "ol") return "list";
            if (/^h[1-6]$/.test(tag)) return "heading";

            if (tag === "input") {
                const type = (el as HTMLInputElement).type?.toLowerCase() || "text";
                if (type === "checkbox") return "checkbox";
                if (type === "radio") return "radio";
                if (type === "submit" || type === "button" || type === "reset") return "button";
                // text-like input types
                if (["text", "email", "password", "search", "tel", "url", "number", ""].includes(type)) return "textbox";
            }

            return null;
        }

        function getAccessibleName(el: HTMLElement): string {
            // 1. aria-label
            const ariaLabel = el.getAttribute("aria-label");
            if (ariaLabel) return ariaLabel.trim();

            // 2. aria-labelledby
            const labelledBy = el.getAttribute("aria-labelledby");
            if (labelledBy) {
                const labelEl = document.getElementById(labelledBy);
                if (labelEl) return labelEl.textContent?.trim() ?? "";
            }

            // 3. <label> for inputs
            if (el.id) {
                const label = document.querySelector(`label[for="${el.id}"]`);
                if (label) return label.textContent?.trim() ?? "";
            }

            // 4. placeholder (for inputs)
            if ((el as HTMLInputElement).placeholder) {
                return (el as HTMLInputElement).placeholder.trim();
            }

            // 5. value (for submit / button inputs)
            const inputEl = el as HTMLInputElement;
            if (inputEl.type === "submit" || inputEl.type === "button") {
                return (inputEl.value ?? "").trim();
            }

            // 6. alt (for images)
            if ((el as HTMLImageElement).alt) {
                return (el as HTMLImageElement).alt.trim();
            }

            // 7. title
            if (el.title) return el.title.trim();

            // 8. textContent (buttons, links, headings)
            return el.textContent?.trim() ?? "";
        }

        // ── Count how many elements on the page match the same role+name ──
        function countA11yMatches(role: string, name: string): { count: number; index: number; target: HTMLElement | null } {
            const selectors = ROLE_TAG_MAP[role];
            if (!selectors) return { count: 0, index: -1, target: null };

            const matches: HTMLElement[] = [];
            for (const sel of selectors) {
                const els = document.querySelectorAll<HTMLElement>(sel);
                for (const el of els) {
                    if (getAccessibleName(el) === name) {
                        matches.push(el);
                    }
                }
            }
            return { count: matches.length, index: -1, target: null };
        }

        function findA11yIndex(el: HTMLElement, role: string, name: string): number {
            const selectors = ROLE_TAG_MAP[role];
            if (!selectors) return 1;

            const matches: HTMLElement[] = [];
            for (const sel of selectors) {
                const els = document.querySelectorAll<HTMLElement>(sel);
                for (const e of els) {
                    if (getAccessibleName(e) === name) {
                        matches.push(e);
                    }
                }
            }

            // Deduplicate — some elements may match multiple CSS selectors
            const unique = [...new Set(matches)];
            const idx = unique.indexOf(el);
            return idx >= 0 ? idx + 1 : 1;  // 1-based
        }

        // ── Find nearest identifiable ancestor ────────────────────
        function findParentContext(el: HTMLElement): string | null {
            let curr = el.parentElement;
            while (curr && curr !== document.body && curr !== document.documentElement) {
                // 1. Check #id
                if (curr.id) {
                    return `#${curr.id}`;
                }
                // 2. Check role + accessible name
                const role = detectRole(curr);
                if (role) {
                    const name = getAccessibleName(curr);
                    if (name && name.length < 60) {
                        return `${role} "${name}"`;
                    }
                }
                curr = curr.parentElement;
            }
            return null;
        }

        // ── Main getSelector — accessibility-first with complex support ──
        function getSelector(el: HTMLElement): string {
            // 1. Try accessibility selector
            const role = detectRole(el);
            if (role) {
                const name = getAccessibleName(el);
                if (name && name.length < 80) {
                    const baseSelector = `${role} "${name}"`;
                    const info = countA11yMatches(role, name);

                    if (info.count <= 1) {
                        // Unique — simple a11y selector
                        return baseSelector;
                    }

                    // Multiple matches — try parent context first for readability
                    const parentCtx = findParentContext(el);
                    if (parentCtx) {
                        return `${parentCtx} >> ${baseSelector}`;
                    }

                    // Fall back to nth-index
                    const idx = findA11yIndex(el, role, name);
                    return `${baseSelector} [${idx}]`;
                }
            }

            // 2. #id
            if (el.id) {
                return `#${el.id}`;
            }

            // 3. Placeholder
            if ((el as HTMLInputElement).placeholder) {
                return `[placeholder="${(el as HTMLInputElement).placeholder}"]`;
            }

            // 4. Name attribute
            if ((el as HTMLInputElement).name) {
                return `[name="${(el as HTMLInputElement).name}"]`;
            }

            // 5. CSS path fallback
            return getCssPath(el);
        }

        function getCssPath(el: HTMLElement): string {
            if (!(el instanceof Element)) return "";
            const path: string[] = [];
            let curr: Element | null = el;

            while (curr && curr.nodeType === Node.ELEMENT_NODE && curr.tagName.toLowerCase() !== "html") {
                let selector = curr.tagName.toLowerCase();
                if (curr.id) {
                    selector += `#${curr.id}`;
                    path.unshift(selector);
                    break;
                } else {
                    let sib: Element | null = curr;
                    let nth = 1;
                    while ((sib = sib.previousElementSibling)) {
                        if (sib.tagName.toLowerCase() === selector) nth++;
                    }
                    if (nth !== 1) selector += `:nth-of-type(${nth})`;
                }
                path.unshift(selector);
                curr = curr.parentElement;
            }
            return path.join(" > ");
        }

        // ── Recording control ──────────────────────────────────────
        function startRecording() {
            if (isRecording) return;
            isRecording = true;
            stepCount = 0;
            console.log("[Gherkin Recorder] Started");

            createOverlay();
            createTooltip();

            document.addEventListener("click", handleClick, true);
            document.addEventListener("input", handleInput, true);
            document.addEventListener("change", handleChange, true);
            document.addEventListener("keydown", handleKeyDown, true);
            document.addEventListener("mousemove", handleMouseMove, true);
        }

        function stopRecording() {
            if (!isRecording) return;
            isRecording = false;
            console.log("[Gherkin Recorder] Stopped");

            // Clear debounce timers
            for (const timer of inputTimers.values()) clearTimeout(timer);
            inputTimers.clear();

            removeOverlay();
            removeTooltip();

            document.removeEventListener("click", handleClick, true);
            document.removeEventListener("input", handleInput, true);
            document.removeEventListener("change", handleChange, true);
            document.removeEventListener("keydown", handleKeyDown, true);
            document.removeEventListener("mousemove", handleMouseMove, true);
        }

        // ── Overlay UI ─────────────────────────────────────────────
        function createOverlay() {
            overlay = document.createElement("div");
            overlay.id = "gherkin-recorder-overlay";
            overlay.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 2147483647;
                background: linear-gradient(135deg, rgba(20, 20, 30, 0.92), rgba(40, 10, 20, 0.92));
                color: #fff;
                padding: 12px 20px;
                border-radius: 16px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 13px;
                font-weight: 500;
                pointer-events: none;
                display: flex;
                flex-direction: column;
                gap: 4px;
                backdrop-filter: blur(12px);
                border: 1px solid rgba(255, 60, 60, 0.3);
                box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05);
                max-width: 350px;
                transition: opacity 0.2s;
            `;
            overlay.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <div id="gherkin-rec-dot" style="width:8px; height:8px; background:#ff3c3c; border-radius:50%; box-shadow:0 0 6px #ff3c3c;"></div>
                    <span id="gherkin-rec-label">Recording… <span id="gherkin-rec-count" style="opacity:0.6">(0 steps)</span></span>
                </div>
                <div id="gherkin-rec-last" style="font-size:11px; opacity:0.5; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:310px;"></div>
            `;

            const style = document.createElement("style");
            style.id = "gherkin-recording-style";
            style.textContent = `
                @keyframes gherkin-blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }
                #gherkin-rec-dot {
                    animation: gherkin-blink 1.2s ease-in-out infinite;
                }
            `;
            document.head.appendChild(style);
            document.body.appendChild(overlay);
        }

        function removeOverlay() {
            if (overlay) {
                overlay.remove();
                overlay = null;
            }
            document.getElementById("gherkin-recording-style")?.remove();
        }

        function updateOverlay(step: string) {
            stepCount++;
            const countEl = document.getElementById("gherkin-rec-count");
            const lastEl = document.getElementById("gherkin-rec-last");
            if (countEl) countEl.textContent = `(${stepCount} step${stepCount !== 1 ? "s" : ""})`;
            if (lastEl) lastEl.textContent = step;
        }

        // ── Selector tooltip (floating near cursor) ────────────────
        function createTooltip() {
            tooltip = document.createElement("div");
            tooltip.id = "gherkin-recorder-tooltip";
            tooltip.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                z-index: 2147483646;
                background: rgba(0, 0, 0, 0.85);
                color: #7fdbca;
                padding: 4px 10px;
                border-radius: 6px;
                font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
                font-size: 11px;
                pointer-events: none;
                display: none;
                white-space: nowrap;
                max-width: 400px;
                overflow: hidden;
                text-overflow: ellipsis;
                backdrop-filter: blur(8px);
                border: 1px solid rgba(127, 219, 202, 0.2);
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            `;
            document.body.appendChild(tooltip);
        }

        function removeTooltip() {
            if (tooltip) {
                tooltip.remove();
                tooltip = null;
            }
        }

        // ── Event handlers ─────────────────────────────────────────
        function handleMouseMove(event: MouseEvent) {
            if (!isRecording || !tooltip) return;
            const target = event.target as HTMLElement;
            if (!target || target === overlay || target === tooltip) {
                tooltip.style.display = "none";
                return;
            }

            const sel = getSelector(target);
            tooltip.textContent = sel;
            tooltip.style.display = "block";
            tooltip.style.left = `${Math.min(event.clientX + 14, window.innerWidth - 420)}px`;
            tooltip.style.top = `${Math.max(event.clientY - 30, 4)}px`;
        }

        function handleClick(event: MouseEvent) {
            if (!isRecording) return;
            const target = event.target as HTMLElement;
            if (!target || target.closest("#gherkin-recorder-overlay")) return;

            // Detect <a> link clicks that navigate
            const link = target.closest("a[href]") as HTMLAnchorElement | null;
            if (link && link.href && !link.href.startsWith("javascript:")) {
                const href = link.href;
                // Only record navigate if it's a full navigation (not anchor, not same page)
                if (href !== window.location.href && !href.startsWith("#")) {
                    const step = `browser navigate to '${href}'`;
                    sendStep(step);
                    return;
                }
            }

            const selector = getSelector(target);
            const step = `browser click '${selector}'`;
            sendStep(step);
        }

        function handleInput(event: Event) {
            if (!isRecording) return;
            const target = event.target as HTMLInputElement | HTMLTextAreaElement;
            if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") return;

            // Skip non-text inputs
            const type = (target as HTMLInputElement).type?.toLowerCase() || "text";
            if (["checkbox", "radio", "submit", "button", "reset", "file", "image", "hidden"].includes(type)) return;

            // Debounce: restart timer for this element
            const existing = inputTimers.get(target);
            if (existing) clearTimeout(existing);

            inputTimers.set(target, setTimeout(() => {
                inputTimers.delete(target);
                const selector = getSelector(target);
                const value = target.value;
                const step = `browser fill '${selector}' with '${value}'`;
                sendStep(step);
            }, DEBOUNCE_MS));
        }

        function handleChange(event: Event) {
            if (!isRecording) return;
            const target = event.target as HTMLElement;

            if (target.tagName === "SELECT") {
                const selector = getSelector(target);
                const value = (target as HTMLSelectElement).value;
                sendStep(`browser select '${selector}' value '${value}'`);
            } else if (target.tagName === "INPUT") {
                const inputEl = target as HTMLInputElement;
                if (inputEl.type === "checkbox") {
                    const selector = getSelector(target);
                    sendStep(inputEl.checked ? `browser check '${selector}'` : `browser uncheck '${selector}'`);
                }
                // Text inputs are handled by debounced handleInput
            }
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (!isRecording) return;
            // Only record significant keys
            const recordableKeys = ["Enter", "Tab", "Escape", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
            if (recordableKeys.includes(event.key)) {
                sendStep(`browser press '${event.key}'`);
            }
        }

        function sendStep(step: string) {
            console.log("[Gherkin Recorder] Sending step:", step);
            updateOverlay(step);
            chrome.runtime.sendMessage({ type: "record:step", step });
        }
    },
});
