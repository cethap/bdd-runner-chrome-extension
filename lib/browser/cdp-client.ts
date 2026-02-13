import type { BrowserTarget, BoundingBox } from "./types";

/**
 * CDP Client — wraps chrome.debugger to provide high-level browser automation.
 * Runs in the background service worker.
 *
 * Features smart auto-waiting:
 *  - Click detects if a navigation was triggered and waits for page load
 *  - waitForSelector is resilient to page transitions during polling
 *  - All element interactions auto-wait for the element to appear
 */
export class CdpClient {
    private target: BrowserTarget | null = null;
    private readonly CDP_VERSION = "1.3";
    private readonly DEFAULT_TIMEOUT = 10000;
    private readonly NAVIGATION_SETTLE_MS = 300;

    // ── Lifecycle ──────────────────────────────────────────────

    async openTab(url: string): Promise<number> {
        const tab = await chrome.tabs.create({ url, active: true });
        if (!tab.id) throw new Error("Failed to create tab");
        await this.attach(tab.id);
        await this.waitForLoad();
        return tab.id;
    }

    async attach(tabId: number): Promise<void> {
        if (this.target?.attached) {
            await this.detach();
        }
        await chrome.debugger.attach({ tabId }, this.CDP_VERSION);
        this.target = { tabId, attached: true };
        await this.send("Page.enable");
        await this.send("DOM.enable");
        await this.send("Runtime.enable");
    }

    async detach(): Promise<void> {
        if (!this.target?.attached) return;
        try {
            await chrome.debugger.detach({ tabId: this.target.tabId });
        } catch {
            // Already detached
        }
        this.target = null;
    }

    async closeTab(): Promise<void> {
        if (!this.target) return;
        const tabId = this.target.tabId;
        await this.detach();
        try {
            await chrome.tabs.remove(tabId);
        } catch {
            // Tab may already be closed
        }
    }

    get isAttached(): boolean {
        return this.target?.attached ?? false;
    }

    get tabId(): number | null {
        return this.target?.tabId ?? null;
    }

    // ── Low-level CDP ──────────────────────────────────────────

    private async send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
        if (!this.target?.attached) {
            throw new Error("No debugger session — use 'browser open' first");
        }
        const result = await chrome.debugger.sendCommand(
            { tabId: this.target.tabId },
            method,
            params,
        );
        return result as T;
    }

    // ── Navigation ─────────────────────────────────────────────

    async navigate(url: string): Promise<void> {
        await this.send("Page.navigate", { url });
        await this.waitForLoad();
    }

    /**
     * Wait for page to reach "complete" or "interactive" readyState.
     * Tolerates errors during navigation (page context destroyed, etc.).
     */
    private async waitForLoad(timeout?: number): Promise<void> {
        const deadline = Date.now() + (timeout ?? this.DEFAULT_TIMEOUT);
        while (Date.now() < deadline) {
            try {
                const result = await this.evaluate<string>("document.readyState");
                if (result === "complete" || result === "interactive") return;
            } catch {
                // Page may be mid-navigation — context destroyed, etc.
            }
            await this.sleep(100);
        }
    }

    /**
     * Detect if a navigation occurred by comparing the current URL before
     * and after an action, and wait for the new page to fully load.
     */
    private async waitForPossibleNavigation(urlBefore: string): Promise<void> {
        // Give the browser a moment for the navigation to start
        await this.sleep(this.NAVIGATION_SETTLE_MS);

        // Check if URL changed (navigation happened)
        try {
            const urlAfter = await this.getCurrentUrl();
            if (urlAfter !== urlBefore) {
                // Navigation detected — wait for new page to load
                await this.waitForLoad();
                return;
            }
        } catch {
            // If we can't evaluate, the page is likely navigating
            await this.waitForLoad();
            return;
        }

        // Even if URL hasn't changed, the page might be doing a SPA transition.
        // Check if readyState went back to loading
        try {
            const readyState = await this.evaluate<string>("document.readyState");
            if (readyState === "loading") {
                await this.waitForLoad();
            }
        } catch {
            await this.waitForLoad();
        }
    }

    /**
     * Get the current page URL via JS evaluation.
     */
    private async getCurrentUrl(): Promise<string> {
        return await this.evaluate<string>("window.location.href");
    }

    // ── Evaluate JS ────────────────────────────────────────────

    async evaluate<T = unknown>(expression: string): Promise<T> {
        const result = await this.send<{
            result: {
                type: string;
                value?: unknown;
                description?: string;
                subtype?: string;
                objectId?: string;
            };
            exceptionDetails?: { text: string; exception?: { description?: string } };
        }>("Runtime.evaluate", {
            expression,
            returnByValue: true,
            awaitPromise: true,
        });

        if (result.exceptionDetails) {
            const msg =
                result.exceptionDetails.exception?.description ??
                result.exceptionDetails.text;
            throw new Error(`JS error: ${msg}`);
        }

        return result.result.value as T;
    }

    // ── Element Queries ────────────────────────────────────────

    async querySelector(selector: string): Promise<string> {
        const query = this.queryExpression(selector);
        const result = await this.send<{
            result: {
                type: string;
                subtype?: string;
                objectId?: string;
                description?: string;
            };
            exceptionDetails?: { text: string; exception?: { description?: string } };
        }>("Runtime.evaluate", {
            expression: query,
            returnByValue: false,
        });

        if (result.exceptionDetails) {
            throw new Error(`querySelector error: ${result.exceptionDetails.text}`);
        }

        if (result.result.subtype === "null" || !result.result.objectId) {
            throw new Error(`Element not found: ${selector}`);
        }

        return result.result.objectId;
    }

    // ── Click ──────────────────────────────────────────────────

    /**
     * Click an element. If the click triggers a page navigation,
     * automatically waits for the new page to finish loading.
     */
    async click(selector: string): Promise<void> {
        await this.waitForSelector(selector);
        await this.scrollIntoView(selector);
        const box = await this.getBoundingBox(selector);
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;

        // Capture URL before click to detect navigation
        let urlBefore = "";
        try {
            urlBefore = await this.getCurrentUrl();
        } catch {
            // Ignore — we'll still try to detect navigation
        }

        await this.send("Input.dispatchMouseEvent", {
            type: "mousePressed",
            x,
            y,
            button: "left",
            clickCount: 1,
        });
        await this.send("Input.dispatchMouseEvent", {
            type: "mouseReleased",
            x,
            y,
            button: "left",
            clickCount: 1,
        });

        // Smart auto-wait: detect if click caused a navigation
        await this.waitForPossibleNavigation(urlBefore);
    }

    // ── Fill (type text) ───────────────────────────────────────

    async fill(selector: string, value: string): Promise<void> {
        await this.waitForSelector(selector);
        const query = this.queryExpression(selector);
        // Focus and clear
        await this.evaluate(`
      (() => {
        const el = ${query};
        if (!el) throw new Error('Element not found: ${selector}');
        el.focus();
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);

        // Type each character
        for (const char of value) {
            await this.send("Input.dispatchKeyEvent", {
                type: "keyDown",
                text: char,
                unmodifiedText: char,
                key: char,
            });
            await this.send("Input.dispatchKeyEvent", {
                type: "keyUp",
                key: char,
            });
        }

        // Fire change event
        await this.evaluate(`
      (() => {
        const el = ${query};
        if (el) {
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()
    `);
    }

    // ── Text Content ───────────────────────────────────────────

    async getText(selector: string): Promise<string> {
        await this.waitForSelector(selector);
        const query = this.queryExpression(selector);
        const text = await this.evaluate<string>(`
      (() => {
        const el = ${query};
        if (!el) throw new Error('Element not found: ${selector}');
        return el.textContent?.trim() ?? '';
      })()
    `);
        return text;
    }

    // ── Input Value ────────────────────────────────────────────

    async getValue(selector: string): Promise<string> {
        await this.waitForSelector(selector);
        const query = this.queryExpression(selector);
        return await this.evaluate<string>(`
      (() => {
        const el = ${query};
        if (!el) throw new Error('Element not found: ${selector}');
        return el.value ?? '';
      })()
    `);
    }

    // ── Visibility ─────────────────────────────────────────────

    async isVisible(selector: string): Promise<boolean> {
        const query = this.queryExpression(selector);
        return await this.evaluate<boolean>(`
      (() => {
        const el = ${query};
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && style.opacity !== '0'
          && el.offsetParent !== null;
      })()
    `);
    }

    // ── Screenshot ─────────────────────────────────────────────

    async screenshot(): Promise<string> {
        const result = await this.send<{ data: string }>(
            "Page.captureScreenshot",
            { format: "png" },
        );
        return result.data; // base64 PNG
    }

    // ── Wait for Selector ──────────────────────────────────────

    /**
     * Smart wait: polls for an element, gracefully handling page navigations.
     * If an evaluate call fails (e.g. context destroyed during navigation),
     * it retries instead of throwing immediately.
     */
    async waitForSelector(selector: string, timeout?: number): Promise<void> {
        const query = this.queryExpression(selector);
        const deadline = Date.now() + (timeout ?? this.DEFAULT_TIMEOUT);
        let lastError = "";
        while (Date.now() < deadline) {
            try {
                const exists = await this.evaluate<boolean>(
                    `(${query}) !== null`,
                );
                if (exists) return;
            } catch (err) {
                // Context may be destroyed during navigation — keep retrying
                lastError = err instanceof Error ? err.message : String(err);
            }
            await this.sleep(150);
        }
        throw new Error(
            `Timeout waiting for element: ${selector}` +
            (lastError ? ` (last error: ${lastError})` : ""),
        );
    }

    // ── Select (dropdown) ─────────────────────────────────────

    async select(selector: string, value: string): Promise<void> {
        await this.waitForSelector(selector);
        const query = this.queryExpression(selector);
        await this.evaluate(`
      (() => {
        const el = ${query};
        if (!el) throw new Error('Element not found: ${selector}');
        el.value = ${JSON.stringify(value)};
        el.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `);
    }

    // ── Checkbox ───────────────────────────────────────────────

    async check(selector: string): Promise<void> {
        await this.waitForSelector(selector);
        const query = this.queryExpression(selector);
        await this.evaluate(`
      (() => {
        const el = ${query};
        if (!el) throw new Error('Element not found: ${selector}');
        if (!el.checked) { el.click(); }
      })()
    `);
    }

    async uncheck(selector: string): Promise<void> {
        await this.waitForSelector(selector);
        const query = this.queryExpression(selector);
        await this.evaluate(`
      (() => {
        const el = ${query};
        if (!el) throw new Error('Element not found: ${selector}');
        if (el.checked) { el.click(); }
      })()
    `);
    }

    // ── Keyboard ───────────────────────────────────────────────

    async press(key: string): Promise<void> {
        const keyMap: Record<string, { key: string; code: string; keyCode: number }> = {
            Enter: { key: "Enter", code: "Enter", keyCode: 13 },
            Tab: { key: "Tab", code: "Tab", keyCode: 9 },
            Escape: { key: "Escape", code: "Escape", keyCode: 27 },
            Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
            Delete: { key: "Delete", code: "Delete", keyCode: 46 },
            ArrowUp: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
            ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
            ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
            ArrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
            Space: { key: " ", code: "Space", keyCode: 32 },
        };

        const mapped = keyMap[key] ?? { key, code: `Key${key.toUpperCase()}`, keyCode: key.charCodeAt(0) };

        await this.send("Input.dispatchKeyEvent", {
            type: "keyDown",
            key: mapped.key,
            code: mapped.code,
            windowsVirtualKeyCode: mapped.keyCode,
            nativeVirtualKeyCode: mapped.keyCode,
        });
        await this.send("Input.dispatchKeyEvent", {
            type: "keyUp",
            key: mapped.key,
            code: mapped.code,
            windowsVirtualKeyCode: mapped.keyCode,
            nativeVirtualKeyCode: mapped.keyCode,
        });
    }

    // ── Accessibility Selector Engine ──────────────────────────

    /**
     * Detect if a selector is an accessibility selector.
     * Format: `role "accessible name"` — e.g. `button "Login"`, `textbox "Username"`
     * 
     * Supported roles: button, textbox, link, heading, checkbox, radio,
     * combobox, listbox, option, menuitem, tab, dialog, alert, img, list,
     * navigation, search, region, form
     */
    private static readonly A11Y_PATTERN = /^(button|textbox|link|heading|checkbox|radio|combobox|listbox|option|menuitem|tab|dialog|alert|img|list|navigation|search|region|form|text|StaticText)\s+"(.+)"$/;

    private isAccessibilitySelector(selector: string): boolean {
        return CdpClient.A11Y_PATTERN.test(selector);
    }

    /**
     * Build a JS expression that finds an element by accessibility role + name.
     * Returns the first matching element or null.
     */
    private buildA11yQueryJS(selector: string): string {
        const match = selector.match(CdpClient.A11Y_PATTERN);
        if (!match) throw new Error(`Invalid accessibility selector: ${selector}`);

        const role = match[1]!;
        const name = match[2]!;

        // Map accessibility roles to possible HTML elements + ARIA role selectors
        const roleMap: Record<string, string[]> = {
            button: ['button', '[role="button"]', 'input[type="button"]', 'input[type="submit"]', 'input[type="reset"]'],
            textbox: ['input:not([type])', 'input[type="text"]', 'input[type="email"]', 'input[type="password"]', 'input[type="search"]', 'input[type="tel"]', 'input[type="url"]', 'input[type="number"]', 'textarea', '[role="textbox"]'],
            link: ['a[href]', '[role="link"]'],
            heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', '[role="heading"]'],
            checkbox: ['input[type="checkbox"]', '[role="checkbox"]'],
            radio: ['input[type="radio"]', '[role="radio"]'],
            combobox: ['select', '[role="combobox"]', '[role="listbox"]'],
            listbox: ['select[multiple]', '[role="listbox"]'],
            option: ['option', '[role="option"]'],
            menuitem: ['[role="menuitem"]', '[role="menuitemcheckbox"]', '[role="menuitemradio"]'],
            tab: ['[role="tab"]'],
            dialog: ['dialog', '[role="dialog"]', '[role="alertdialog"]'],
            alert: ['[role="alert"]'],
            img: ['img', '[role="img"]'],
            list: ['ul', 'ol', '[role="list"]'],
            navigation: ['nav', '[role="navigation"]'],
            search: ['[role="search"]', 'search'],
            region: ['section[aria-label]', '[role="region"]'],
            form: ['form', '[role="form"]'],
            text: ['*'],
            StaticText: ['*'],
        };

        const cssSelectors = roleMap[role] ?? [`[role="${role}"]`];
        const selectorList = cssSelectors.map((s: string) => JSON.stringify(s)).join(", ");
        const escapedName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        // text/StaticText use partial matching; everything else uses exact match
        const usePartial = role === "text" || role === "StaticText";
        const matchExpr = usePartial
            ? `getAccessibleName(el).includes(target)`
            : `getAccessibleName(el) === target`;

        return `
      (() => {
        const selectors = [${selectorList}];
        const target = '${escapedName}';

        function getAccessibleName(el) {
          // 1. aria-label
          if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
          // 2. aria-labelledby
          const labelledBy = el.getAttribute('aria-labelledby');
          if (labelledBy) {
            const label = document.getElementById(labelledBy);
            if (label) return label.textContent?.trim() ?? '';
          }
          // 3. <label> for inputs
          if (el.id) {
            const label = document.querySelector('label[for="' + el.id + '"]');
            if (label) return label.textContent?.trim() ?? '';
          }
          // 4. placeholder (for inputs)
          if (el.placeholder) return el.placeholder.trim();
          // 5. value (for submit buttons)
          if (el.type === 'submit' || el.type === 'button') return (el.value ?? '').trim();
          // 6. alt (for images)
          if (el.alt) return el.alt.trim();
          // 7. title attribute
          if (el.title) return el.title.trim();
          // 8. textContent as fallback
          return el.textContent?.trim() ?? '';
        }

        let best = null;
        let bestLen = Infinity;
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          for (const el of els) {
            if (${matchExpr}) {
              const len = (el.textContent || '').length;
              if (len < bestLen) { best = el; bestLen = len; }
            }
          }
        }
        return best;
      })()`;
    }

    /**
     * Build the JS expression to query an element — supports:
     *  - CSS selectors: `document.querySelector(...)`
     *  - Accessibility selectors: `button "Login"`
     *  - Nth-index: `button "Delete" [2]` → find the 2nd match
     *  - Parent-child chain: `form "Login" >> textbox "Email"` → scope child to parent subtree
     */
    private queryExpression(selector: string): string {
        // ── Handle >> chaining ────────────────────────────────
        if (selector.includes(" >> ")) {
            const parts = selector.split(" >> ").map((s) => s.trim());
            // Build nested: resolve parent, then scope child inside parent
            let expr = this.querySingle(parts[0]!);
            for (let i = 1; i < parts.length; i++) {
                const childExpr = this.buildScopedQuery(parts[i]!);
                expr = `
              (() => {
                const parent = ${expr};
                if (!parent) return null;
                ${childExpr}
              })()`;
            }
            return expr;
        }

        return this.querySingle(selector);
    }

    /**
     * Resolve a single selector segment (may have [N] index suffix).
     */
    private querySingle(selector: string): string {
        // ── Handle [N] nth-index suffix ───────────────────────
        const nthMatch = selector.match(/^(.+?)\s+\[(\d+)\]$/);
        if (nthMatch) {
            const baseSel = nthMatch[1]!;
            const index = parseInt(nthMatch[2]!, 10); // 1-based
            if (this.isAccessibilitySelector(baseSel)) {
                return this.buildA11yNthQueryJS(baseSel, index);
            }
            // CSS selector with nth-index
            return `document.querySelectorAll(${JSON.stringify(baseSel)})[${index - 1}] ?? null`;
        }

        // ── Standard resolvers ────────────────────────────────
        if (this.isAccessibilitySelector(selector)) {
            return this.buildA11yQueryJS(selector);
        }
        return `document.querySelector(${JSON.stringify(selector)})`;
    }

    /**
     * Build a JS snippet that queries a child selector scoped to a `parent` variable.
     * Returns a block of code (not an IIFE) — expects `parent` to already be defined.
     */
    private buildScopedQuery(childSelector: string): string {
        const nthMatch = childSelector.match(/^(.+?)\s+\[(\d+)\]$/);
        const baseSel = nthMatch ? nthMatch[1]! : childSelector;
        const index = nthMatch ? parseInt(nthMatch[2]!, 10) : 0;

        if (this.isAccessibilitySelector(baseSel)) {
            const match = baseSel.match(CdpClient.A11Y_PATTERN);
            if (!match) return `return null;`;

            const role = match[1]!;
            const name = match[2]!;
            const cssSelectors = (({
                button: ['button', '[role="button"]', 'input[type="button"]', 'input[type="submit"]', 'input[type="reset"]'],
                textbox: ['input:not([type])', 'input[type="text"]', 'input[type="email"]', 'input[type="password"]', 'input[type="search"]', 'input[type="tel"]', 'input[type="url"]', 'input[type="number"]', 'textarea', '[role="textbox"]'],
                link: ['a[href]', '[role="link"]'],
                heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', '[role="heading"]'],
                checkbox: ['input[type="checkbox"]', '[role="checkbox"]'],
                radio: ['input[type="radio"]', '[role="radio"]'],
                combobox: ['select', '[role="combobox"]', '[role="listbox"]'],
                listbox: ['select[multiple]', '[role="listbox"]'],
                option: ['option', '[role="option"]'],
                menuitem: ['[role="menuitem"]', '[role="menuitemcheckbox"]', '[role="menuitemradio"]'],
                tab: ['[role="tab"]'],
                dialog: ['dialog', '[role="dialog"]', '[role="alertdialog"]'],
                alert: ['[role="alert"]'],
                img: ['img', '[role="img"]'],
                list: ['ul', 'ol', '[role="list"]'],
                navigation: ['nav', '[role="navigation"]'],
                search: ['[role="search"]', 'search'],
                region: ['section[aria-label]', '[role="region"]'],
                form: ['form', '[role="form"]'],
                text: ['*'],
                StaticText: ['*'],
            } as Record<string, string[]>)[role]) ?? [`[role="${role}"]`];

            const selectorList = cssSelectors.map((s: string) => JSON.stringify(s)).join(", ");
            const escapedName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
            const usePartial = role === "text" || role === "StaticText";
            const matchExpr = usePartial
                ? `getAccessibleName(el).includes(target)`
                : `getAccessibleName(el) === target`;

            return `
              const selectors = [${selectorList}];
              const target = '${escapedName}';
              function getAccessibleName(el) {
                if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
                const labelledBy = el.getAttribute('aria-labelledby');
                if (labelledBy) { const l = document.getElementById(labelledBy); if (l) return l.textContent?.trim() ?? ''; }
                if (el.id) { const l = document.querySelector('label[for="' + el.id + '"]'); if (l) return l.textContent?.trim() ?? ''; }
                if (el.placeholder) return el.placeholder.trim();
                if (el.type === 'submit' || el.type === 'button') return (el.value ?? '').trim();
                if (el.alt) return el.alt.trim();
                if (el.title) return el.title.trim();
                return el.textContent?.trim() ?? '';
              }
              const matches = [];
              for (const sel of selectors) {
                for (const el of parent.querySelectorAll(sel)) {
                  if (${matchExpr}) matches.push(el);
                }
              }
              ${index > 0 ? `return matches[${index - 1}] ?? null;` : `return matches[0] ?? null;`}
            `;
        }

        // CSS child selector scoped to parent
        if (index > 0) {
            return `return parent.querySelectorAll(${JSON.stringify(baseSel)})[${index - 1}] ?? null;`;
        }
        return `return parent.querySelector(${JSON.stringify(baseSel)});`;
    }

    /**
     * Build JS expression for an a11y selector with nth-index.
     */
    private buildA11yNthQueryJS(selector: string, index: number): string {
        const match = selector.match(CdpClient.A11Y_PATTERN);
        if (!match) throw new Error(`Invalid accessibility selector: ${selector}`);

        const role = match[1]!;
        const name = match[2]!;

        const roleMap: Record<string, string[]> = {
            button: ['button', '[role="button"]', 'input[type="button"]', 'input[type="submit"]', 'input[type="reset"]'],
            textbox: ['input:not([type])', 'input[type="text"]', 'input[type="email"]', 'input[type="password"]', 'input[type="search"]', 'input[type="tel"]', 'input[type="url"]', 'input[type="number"]', 'textarea', '[role="textbox"]'],
            link: ['a[href]', '[role="link"]'],
            heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', '[role="heading"]'],
            checkbox: ['input[type="checkbox"]', '[role="checkbox"]'],
            radio: ['input[type="radio"]', '[role="radio"]'],
            combobox: ['select', '[role="combobox"]', '[role="listbox"]'],
            listbox: ['select[multiple]', '[role="listbox"]'],
            option: ['option', '[role="option"]'],
            menuitem: ['[role="menuitem"]', '[role="menuitemcheckbox"]', '[role="menuitemradio"]'],
            tab: ['[role="tab"]'],
            dialog: ['dialog', '[role="dialog"]', '[role="alertdialog"]'],
            alert: ['[role="alert"]'],
            img: ['img', '[role="img"]'],
            list: ['ul', 'ol', '[role="list"]'],
            navigation: ['nav', '[role="navigation"]'],
            search: ['[role="search"]', 'search'],
            region: ['section[aria-label]', '[role="region"]'],
            form: ['form', '[role="form"]'],
            text: ['*'],
            StaticText: ['*'],
        };

        const cssSelectors = roleMap[role] ?? [`[role="${role}"]`];
        const selectorList = cssSelectors.map((s: string) => JSON.stringify(s)).join(", ");
        const escapedName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        const usePartial = role === "text" || role === "StaticText";
        const matchExpr = usePartial
            ? `getAccessibleName(el).includes(target)`
            : `getAccessibleName(el) === target`;

        return `
      (() => {
        const selectors = [${selectorList}];
        const target = '${escapedName}';

        function getAccessibleName(el) {
          if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
          const labelledBy = el.getAttribute('aria-labelledby');
          if (labelledBy) {
            const label = document.getElementById(labelledBy);
            if (label) return label.textContent?.trim() ?? '';
          }
          if (el.id) {
            const label = document.querySelector('label[for="' + el.id + '"]');
            if (label) return label.textContent?.trim() ?? '';
          }
          if (el.placeholder) return el.placeholder.trim();
          if (el.type === 'submit' || el.type === 'button') return (el.value ?? '').trim();
          if (el.alt) return el.alt.trim();
          if (el.title) return el.title.trim();
          return el.textContent?.trim() ?? '';
        }

        const matches = [];
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          for (const el of els) {
            if (${matchExpr}) matches.push(el);
          }
        }
        return matches[${index - 1}] ?? null;
      })()`;
    }

    // ── Helpers ────────────────────────────────────────────────

    private async scrollIntoView(selector: string): Promise<void> {
        const query = this.queryExpression(selector);
        await this.evaluate(`
      (() => {
        const el = ${query};
        if (el) el.scrollIntoView({ block: 'center', inline: 'center' });
      })()
    `);
    }

    private async getBoundingBox(selector: string): Promise<BoundingBox> {
        const query = this.queryExpression(selector);
        const box = await this.evaluate<BoundingBox | null>(`
      (() => {
        const el = ${query};
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })()
    `);
        if (!box) throw new Error(`Cannot get bounding box for: ${selector}`);
        return box;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

