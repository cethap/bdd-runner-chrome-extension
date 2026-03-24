import type { RoleTagMap } from "./types";

/**
 * Maps accessibility roles to CSS selectors that match elements with that role.
 * This is the single source of truth — used by the recorder content script
 * (directly) and by the CDP client (serialized into JS strings for Runtime.evaluate).
 */
export const ROLE_TAG_MAP: RoleTagMap = {
    button: [
        "button",
        '[role="button"]',
        'input[type="button"]',
        'input[type="submit"]',
        'input[type="reset"]',
    ],
    textbox: [
        'input:not([type])',
        'input[type="text"]',
        'input[type="email"]',
        'input[type="password"]',
        'input[type="search"]',
        'input[type="tel"]',
        'input[type="url"]',
        'input[type="number"]',
        "textarea",
        '[role="textbox"]',
    ],
    link: ['a[href]', '[role="link"]'],
    heading: ["h1", "h2", "h3", "h4", "h5", "h6", '[role="heading"]'],
    checkbox: ['input[type="checkbox"]', '[role="checkbox"]'],
    radio: ['input[type="radio"]', '[role="radio"]'],
    combobox: ["select", '[role="combobox"]', '[role="listbox"]'],
    listbox: ['select[multiple]', '[role="listbox"]'],
    option: ["option", '[role="option"]'],
    menuitem: ['[role="menuitem"]', '[role="menuitemcheckbox"]', '[role="menuitemradio"]'],
    tab: ['[role="tab"]'],
    dialog: ["dialog", '[role="dialog"]', '[role="alertdialog"]'],
    alert: ['[role="alert"]'],
    img: ["img", '[role="img"]'],
    list: ["ul", "ol", '[role="list"]'],
    navigation: ["nav", '[role="navigation"]'],
    search: ['[role="search"]', "search"],
    region: ['section[aria-label]', '[role="region"]'],
    form: ["form", '[role="form"]'],
    text: ["*"],
    StaticText: ["*"],
};

/**
 * Detect the accessibility role of a DOM element.
 * Checks explicit ARIA role first, then falls back to implicit role by tag name.
 */
export function detectRole(el: HTMLElement): string | null {
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
        if (["text", "email", "password", "search", "tel", "url", "number", ""].includes(type))
            return "textbox";
    }

    return null;
}

/**
 * Get the CSS selectors for a given role.
 * Falls back to `[role="<roleName>"]` for unknown roles.
 */
export function selectorsForRole(role: string): string[] {
    return ROLE_TAG_MAP[role] ?? [`[role="${role}"]`];
}

/**
 * Serialize the role map as a JSON string for embedding in Runtime.evaluate JS expressions.
 * Pre-computed once to avoid repeated JSON.stringify calls.
 */
export const ROLE_TAG_MAP_JSON: string = JSON.stringify(ROLE_TAG_MAP);
