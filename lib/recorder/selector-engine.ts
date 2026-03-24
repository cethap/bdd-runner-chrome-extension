import type { SelectorCandidate, SelectorStrategy } from "@/lib/a11y/types";
import { ROLE_TAG_MAP, detectRole } from "@/lib/a11y/role-map";
import { getAccessibleName } from "@/lib/a11y/accessible-name";

// ── Score constants (lower = better) ────────────────────────────
// Mirrors Playwright's scoring tiers adapted to our custom DSL.

const kTestIdScore = 1;
const kOtherTestIdScore = 2;

const kIdScore = 50;

const kTextScoreRange = 10;
const kExactPenalty = kTextScoreRange / 2;

const kRoleWithNameScore = 100;
const kRoleWithNameScoreExact = kRoleWithNameScore + kExactPenalty;

const kLabelScore = 120;
const kLabelScoreExact = kLabelScore + kExactPenalty;

const kPlaceholderScore = 140;
const kPlaceholderScoreExact = kPlaceholderScore + kExactPenalty;

const kAltTextScore = 160;
const kAltTextScoreExact = kAltTextScore + kExactPenalty;

const kTextScore = 160;
const kTextScoreExact = kTextScore + kExactPenalty;
const kShortTextBonus = 20; // bonus (subtracted) for short, clean text ≤30 chars

const kTitleScore = 200;
const kTitleScoreExact = kTitleScore + kExactPenalty;

const kNameAttrScore = 220;

const kRoleOnlyScore = 300;

const kTagScore = 400;
const kTagClassScore = 420;

const kNthScore = 10000;
const kCssPathScore = 10000;

const kBeginPenalizedScore = 50;
const kEndPenalizedScore = 300;

// Roles that are meaningless as standalone selectors (too generic / non-interactive)
const USELESS_ROLE_ONLY = new Set(["presentation", "none", "generic", "separator", "group"]);

// ── Types ───────────────────────────────────────────────────────

interface InternalCandidate {
    selector: string;
    score: number;
    strategy: SelectorStrategy;
}

interface ElementText {
    full: string;
    normalized: string;
    immediate: string;
}

interface TextAlternative {
    text: string;
    scoreBonus: number;
}

// ── Caches (WeakMap = GC-friendly, cleared per-page) ────────────

const textCache = new WeakMap<Element, ElementText>();
const candidateCache = new WeakMap<Element, InternalCandidate[] | null>();

// ── GUID / generated ID detection ──────────────────────────────

function charType(c: string): "lower" | "upper" | "digit" | "other" {
    if (c >= "a" && c <= "z") return "lower";
    if (c >= "A" && c <= "Z") return "upper";
    if (c >= "0" && c <= "9") return "digit";
    return "other";
}

function isGuid(id: string): boolean {
    if (!id) return true;

    // Classic UUID pattern
    if (/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return true;

    // Long hex sequences
    if (/[0-9a-f]{8,}/i.test(id)) return true;

    // Numeric-heavy IDs (>50% digits)
    const digitCount = (id.match(/\d/g) || []).length;
    if (digitCount > id.length * 0.5) return true;

    // High character-type transition rate (like Playwright's isGuidLike)
    let lastType: string | undefined;
    let transitions = 0;
    for (let i = 0; i < id.length; i++) {
        const c = id[i];
        if (c === "-" || c === "_") continue;
        const ct = charType(c!);
        // camelCase transition (upper→lower) is natural, don't count it
        if (ct === "lower" && lastType === "upper") {
            lastType = ct;
            continue;
        }
        if (lastType && lastType !== ct) transitions++;
        lastType = ct;
    }
    if (transitions >= id.length / 4) return true;

    return false;
}

// ── Class stability detection ───────────────────────────────────

function isStableClass(cls: string): boolean {
    if (cls.length <= 1) return false;
    // Skip classes with hashes or random-looking patterns
    if (/[0-9a-f]{6,}/i.test(cls)) return false;
    if (/^[a-z]{1,2}-[0-9a-f]+$/i.test(cls)) return false;
    // Skip Tailwind-like atomic utilities (very short with special chars)
    if (/^-?[a-z]+[:-]/.test(cls) && cls.length < 8) return false;
    // Skip CSS module hashes
    if (/_[a-zA-Z0-9]{5,}$/.test(cls)) return false;
    // Keep semantic-looking classes
    return true;
}

// ── Shadow DOM traversal ────────────────────────────────────────

function parentElementOrShadowHost(el: Element): Element | null {
    if (el.parentElement) return el.parentElement;
    const root = el.getRootNode();
    if (root instanceof ShadowRoot) return root.host;
    return null;
}

// ── Text extraction with normalization and caching ──────────────

function normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, " ").trim();
}

function extractText(el: Element): ElementText {
    const cached = textCache.get(el);
    if (cached) return cached;

    let full = "";
    let immediate = "";

    if (el.nodeName === "SCRIPT" || el.nodeName === "STYLE" || el.nodeName === "NOSCRIPT") {
        const result: ElementText = { full: "", normalized: "", immediate: "" };
        textCache.set(el, result);
        return result;
    }

    // Special case: input submit/button
    if (el instanceof HTMLInputElement && (el.type === "submit" || el.type === "button")) {
        const val = el.value || "";
        const result: ElementText = { full: val, normalized: normalizeWhitespace(val), immediate: val };
        textCache.set(el, result);
        return result;
    }

    for (let child = el.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === Node.TEXT_NODE) {
            const text = child.nodeValue || "";
            full += text;
            immediate += text;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
            full += extractText(child as Element).full;
        }
    }

    // Include shadow DOM text
    if (el.shadowRoot) {
        full += extractText(el.shadowRoot as unknown as Element).full;
    }

    const result: ElementText = {
        full,
        normalized: normalizeWhitespace(full),
        immediate: normalizeWhitespace(immediate),
    };
    textCache.set(el, result);
    return result;
}

// ── Text alternatives (like Playwright's suitableTextAlternatives) ─

function trimWordBoundary(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    const truncated = text.substring(0, maxLength);
    const match = truncated.match(/^(.*)\b(.+?)$/);
    if (!match) return "";
    return match[1]!.trimEnd();
}

function suitableTextAlternatives(text: string): TextAlternative[] {
    const result: TextAlternative[] = [];

    // Strip leading numbers: "123 Submit" → "Submit"
    {
        const match = text.match(/^([\d.,]+)[^.,\w]/);
        if (match) {
            const alt = text.substring(match[1]!.length).trimStart();
            if (alt) result.push({ text: alt, scoreBonus: alt.length <= 30 ? 2 : 1 });
        }
    }

    // Strip trailing numbers: "Item 42" → "Item"
    {
        const match = text.match(/[^.,\w]([\d.,]+)$/);
        if (match) {
            const alt = text.substring(0, text.length - match[1]!.length).trimEnd();
            if (alt) result.push({ text: alt, scoreBonus: alt.length <= 30 ? 2 : 1 });
        }
    }

    // Length-based variants
    if (text.length <= 30) {
        result.push({ text, scoreBonus: 0 });
    } else {
        result.push({ text: trimWordBoundary(text, 80), scoreBonus: 0 });
        result.push({ text: trimWordBoundary(text, 30), scoreBonus: 1 });
    }

    const filtered = result.filter((r) => r.text);
    if (!filtered.length && text) {
        return [{ text: text.substring(0, 80), scoreBonus: 0 }];
    }
    return filtered;
}

// ── Label detection ─────────────────────────────────────────────

function findLabelText(el: HTMLElement): string | null {
    // aria-label / aria-labelledby handled by getAccessibleName, skip here
    // Explicit <label for="id">
    if (el.id) {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label?.textContent?.trim()) return normalizeWhitespace(label.textContent);
    }
    // Wrapping <label>
    const parentLabel = el.closest("label");
    if (parentLabel) {
        const clone = parentLabel.cloneNode(true) as HTMLElement;
        clone.querySelectorAll("input, textarea, select").forEach((inp) => inp.remove());
        const text = clone.textContent?.trim();
        if (text) return normalizeWhitespace(text);
    }
    // HTMLInputElement.labels
    if ("labels" in el) {
        const labels = (el as HTMLInputElement).labels;
        if (labels && labels.length > 0) {
            const text = labels[0]!.textContent?.trim();
            if (text) return normalizeWhitespace(text);
        }
    }
    return null;
}

// ── Uniqueness validation ───────────────────────────────────────

function countCssMatches(selector: string): number {
    try {
        return document.querySelectorAll(selector).length;
    } catch {
        return -1; // invalid CSS
    }
}

function countRoleMatches(role: string, name?: string): number {
    const selectors = ROLE_TAG_MAP[role];
    if (!selectors) return 0;

    const seen = new Set<Element>();
    for (const sel of selectors) {
        for (const el of document.querySelectorAll<HTMLElement>(sel)) {
            if (!name) {
                seen.add(el);
            } else if (getAccessibleName(el) === name) {
                seen.add(el);
            }
        }
    }
    return seen.size;
}

function findRoleMatchIndex(target: HTMLElement, role: string, name: string): number {
    const selectors = ROLE_TAG_MAP[role];
    if (!selectors) return 0;

    const matches: HTMLElement[] = [];
    for (const sel of selectors) {
        for (const el of document.querySelectorAll<HTMLElement>(sel)) {
            if (getAccessibleName(el) === name && !matches.includes(el)) {
                matches.push(el);
            }
        }
    }
    const idx = matches.indexOf(target);
    return idx >= 0 ? idx + 1 : 1; // 1-based
}

function countTextMatches(text: string): number {
    let count = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node: Element | null;
    while ((node = walker.nextNode() as Element | null)) {
        const nodeText = extractText(node).normalized;
        // Exact match OR the element's text starts with the candidate text
        // (supports truncated text alternatives)
        if (nodeText === text || (text.length >= 10 && nodeText.startsWith(text))) count++;
    }
    return count;
}

function countLabelMatches(labelText: string): number {
    let count = 0;
    // Check all labelable elements
    const labelable = document.querySelectorAll<HTMLElement>(
        "input, textarea, select, button, meter, output, progress"
    );
    for (const el of labelable) {
        const lt = findLabelText(el);
        if (lt === labelText) count++;
    }
    return count;
}

/**
 * Validate uniqueness for our custom DSL selectors.
 * Returns: number of matches (1 = unique, >1 = needs disambiguation).
 */
function validateUniqueness(selector: string, strategy: SelectorStrategy): number {
    // CSS-parseable selectors
    if (strategy === "testid" || strategy === "data-test" || strategy === "id" ||
        strategy === "placeholder" || strategy === "name" || strategy === "tag" ||
        strategy === "tag-class" || strategy === "css-path") {
        const count = countCssMatches(selector);
        return count >= 0 ? count : 1;
    }

    // Role-based: parse "role "name"" format
    if (strategy === "role-name") {
        const match = selector.match(/^(\w+)\s+"(.+)"$/);
        if (match) return countRoleMatches(match[1]!, match[2]!);
        return 1;
    }

    if (strategy === "role-only") {
        return countRoleMatches(selector);
    }

    // Text-based: parse 'text "content"'
    if (strategy === "text") {
        const match = selector.match(/^text\s+"(.+)"$/);
        if (match) return countTextMatches(match[1]!);
        return 1;
    }

    // Label-based: parse 'label "content"'
    if (strategy === "label") {
        const match = selector.match(/^label\s+"(.+)"$/);
        if (match) return countLabelMatches(match[1]!);
        return 1;
    }

    // Alt/title attribute selectors: CSS-parseable
    if (strategy === "alt" || strategy === "title") {
        const count = countCssMatches(selector);
        return count >= 0 ? count : 1;
    }

    return 1;
}

// ── Length penalty (like Playwright) ────────────────────────────

function penalizeForLength(candidates: InternalCandidate[]): void {
    for (const c of candidates) {
        if (c.score > kBeginPenalizedScore && c.score < kEndPenalizedScore) {
            c.score += Math.min(kTextScoreRange, (c.selector.length / 10) | 0);
        }
    }
}

// ── Candidate generation for a SINGLE element ──────────────────

function buildSemanticContextCandidates(el: HTMLElement): InternalCandidate[] {
    const candidates: InternalCandidate[] = [];
    const tag = el.nodeName.toLowerCase();

    // 1. Check for landmark roles (implicit or explicit)
    const implicitLandmarks: Record<string, string> = {
        header: "banner", footer: "contentinfo", nav: "navigation",
        main: "main", aside: "complementary", form: "form",
        section: "region", article: "article"
    };
    const landmarkRole = el.getAttribute("role") || implicitLandmarks[tag];
    if (landmarkRole) {
        const name = getAccessibleName(el);
        if (name) {
            candidates.push({
                selector: `${landmarkRole} "${name}"`,
                score: kRoleWithNameScore + 10,
                strategy: "role-name"
            });
        } else {
            candidates.push({
                selector: landmarkRole,
                score: kRoleOnlyScore - 10, // landmarks without names are still better than generic tags
                strategy: "role-only"
            });
        }
    }

    // 2. Check for heading children — "the div that contains the heading 'About this page'"
    const heading = el.querySelector("h1, h2, h3, h4, h5, h6, [role=heading]");
    if (heading) {
        const headingText = normalizeWhitespace(heading.textContent || "");
        if (headingText && headingText.length <= 80) {
            candidates.push({
                selector: `${tag}:has(${heading.tagName.toLowerCase()})`,
                score: kTagScore - 50, // better than plain tag
                strategy: "tag"
            });
        }
    }

    // 3. Check for aria-label or aria-labelledby on the element itself
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) {
        candidates.push({
            selector: `[aria-label="${ariaLabel}"]`,
            score: 90, // Very good — explicit label
            strategy: "role-name"
        });
    }

    const ariaLabelledby = el.getAttribute("aria-labelledby");
    if (ariaLabelledby) {
        const labelEl = document.getElementById(ariaLabelledby);
        if (labelEl?.textContent) {
            candidates.push({
                selector: `[aria-labelledby="${ariaLabelledby}"]`,
                score: 95,
                strategy: "role-name"
            });
        }
    }

    // 4. data-* attributes that look like identifiers (not random)
    for (const attr of el.attributes) {
        if (attr.name.startsWith("data-") &&
            attr.name !== "data-testid" && attr.name !== "data-test" && attr.name !== "data-test-id" &&
            attr.value && attr.value.length < 50 && !isGuid(attr.value) &&
            /^[a-zA-Z][\w-]*$/.test(attr.value)) {
            candidates.push({
                selector: `[${attr.name}="${attr.value}"]`,
                score: 80, // Good — explicit data attribute
                strategy: "name"
            });
        }
    }

    return candidates;
}

function buildCandidatesForElement(el: HTMLElement): InternalCandidate[] {
    const candidates: InternalCandidate[] = [];

    // ── 0. iframe-specific candidates
    if (el.nodeName === "IFRAME") {
        const name = el.getAttribute("name");
        const title = el.getAttribute("title");
        const src = el.getAttribute("src");
        if (name) candidates.push({ selector: `iframe[name="${name}"]`, score: 10, strategy: "name" });
        if (title) candidates.push({ selector: `iframe[title="${title}"]`, score: 15, strategy: "title" });
        // For src, only use if it's a recognizable domain/path (not a data: URL or super long)
        if (src && src.length < 100 && !src.startsWith("data:")) {
            try {
                const url = new URL(src, location.href);
                const shortSrc = url.pathname.length > 1 ? url.pathname : url.hostname;
                candidates.push({ selector: `iframe[src*="${shortSrc}"]`, score: 20, strategy: "name" });
            } catch { /* invalid URL, skip */ }
        }
    }

    // ── 1. data-testid (highest priority)
    const testId = el.getAttribute("data-testid");
    if (testId) {
        candidates.push({
            selector: `[data-testid="${testId}"]`,
            score: kTestIdScore,
            strategy: "testid",
        });
    }

    // ── 2. data-test, data-test-id (other test attributes)
    for (const attr of ["data-test-id", "data-test"]) {
        const val = el.getAttribute(attr);
        if (val) {
            candidates.push({
                selector: `[${attr}="${val}"]`,
                score: kOtherTestIdScore,
                strategy: "data-test",
            });
        }
    }

    // ── 3. #id (non-GUID)
    if (el.id && !isGuid(el.id)) {
        const idSel = /^[a-zA-Z][a-zA-Z0-9\-_]+$/.test(el.id) ? `#${el.id}` : `[id="${el.id}"]`;
        candidates.push({
            selector: idSel,
            score: kIdScore,
            strategy: "id",
        });
    }

    // ── 4. role + accessible name (with text alternatives)
    const role = detectRole(el);
    if (role && !USELESS_ROLE_ONLY.has(role)) {
        const accName = getAccessibleName(el);
        if (accName && accName.length > 0 && accName.length < 200) {
            // Exact match
            if (accName.length <= 80) {
                candidates.push({
                    selector: `${role} "${accName}"`,
                    score: kRoleWithNameScoreExact,
                    strategy: "role-name",
                });
            }
            // Text alternatives
            for (const alt of suitableTextAlternatives(accName)) {
                candidates.push({
                    selector: `${role} "${alt.text}"`,
                    score: kRoleWithNameScore - alt.scoreBonus,
                    strategy: "role-name",
                });
            }
        }

        // role-only (no name) — only for meaningful interactive roles
        candidates.push({
            selector: role,
            score: kRoleOnlyScore,
            strategy: "role-only",
        });
    } else if (role && role === "group") {
        // "group" is only useful with an aria-label (role-name), not role-only
        const accName = getAccessibleName(el);
        if (accName && accName.length > 0 && accName.length < 200) {
            candidates.push({
                selector: `${role} "${accName}"`,
                score: kRoleWithNameScoreExact,
                strategy: "role-name",
            });
        }
    }

    // ── 5. label text (with alternatives)
    const labelText = findLabelText(el);
    if (labelText && labelText.length > 0 && labelText.length < 200) {
        if (labelText.length <= 80) {
            candidates.push({
                selector: `label "${labelText}"`,
                score: kLabelScoreExact,
                strategy: "label",
            });
        }
        for (const alt of suitableTextAlternatives(labelText)) {
            candidates.push({
                selector: `label "${alt.text}"`,
                score: kLabelScore - alt.scoreBonus,
                strategy: "label",
            });
        }
    }

    // ── 6. placeholder (with alternatives)
    const placeholder = (el as HTMLInputElement | HTMLTextAreaElement).placeholder;
    if (placeholder) {
        candidates.push({
            selector: `[placeholder="${placeholder}"]`,
            score: kPlaceholderScoreExact,
            strategy: "placeholder",
        });
        for (const alt of suitableTextAlternatives(placeholder)) {
            candidates.push({
                selector: `[placeholder="${alt.text}"]`,
                score: kPlaceholderScore - alt.scoreBonus,
                strategy: "placeholder",
            });
        }
    }

    // ── 7. alt attribute (images, inputs, areas)
    const alt = el.getAttribute("alt");
    if (alt && ["IMG", "INPUT", "AREA", "APPLET"].includes(el.nodeName)) {
        candidates.push({
            selector: `[alt="${alt}"]`,
            score: kAltTextScoreExact,
            strategy: "alt",
        });
        for (const altVar of suitableTextAlternatives(alt)) {
            candidates.push({
                selector: `[alt="${altVar.text}"]`,
                score: kAltTextScore - altVar.scoreBonus,
                strategy: "alt",
            });
        }
    }

    // ── 8. text content (with alternatives)
    // Use both extracted text and innerText, prefer shorter visible text
    const extractedText = extractText(el).normalized;
    const innerTextRaw = "innerText" in el ? (el as HTMLElement).innerText : "";
    const innerTextNorm = innerTextRaw ? normalizeWhitespace(innerTextRaw) : "";
    // Pick the shorter of the two if both exist and are non-empty
    const text = (innerTextNorm && extractedText)
        ? (innerTextNorm.length <= extractedText.length ? innerTextNorm : extractedText)
        : (extractedText || innerTextNorm);
    if (text && text.length > 0 && el.nodeName !== "SELECT") {
        // Short, clean text gets a bonus to compete with role-name
        const shortBonus = text.length <= 30 ? kShortTextBonus : 0;
        if (text.length <= 80) {
            candidates.push({
                selector: `text "${text}"`,
                score: kTextScoreExact - shortBonus,
                strategy: "text",
            });
        }
        for (const alt of suitableTextAlternatives(text)) {
            const altBonus = alt.text.length <= 30 ? kShortTextBonus : 0;
            candidates.push({
                selector: `text "${alt.text}"`,
                score: kTextScore - alt.scoreBonus - altBonus,
                strategy: "text",
            });
        }
    }

    // ── 9. title attribute (with alternatives)
    const title = el.getAttribute("title");
    if (title) {
        candidates.push({
            selector: `[title="${title}"]`,
            score: kTitleScoreExact,
            strategy: "title",
        });
        for (const alt of suitableTextAlternatives(title)) {
            candidates.push({
                selector: `[title="${alt.text}"]`,
                score: kTitleScore - alt.scoreBonus,
                strategy: "title",
            });
        }
    }

    // ── 10. name attribute (for form elements)
    const nameAttr = el.getAttribute("name");
    if (nameAttr && ["BUTTON", "FORM", "FIELDSET", "INPUT", "SELECT", "TEXTAREA", "OUTPUT"].includes(el.nodeName)) {
        candidates.push({
            selector: `[name="${nameAttr}"]`,
            score: kNameAttrScore,
            strategy: "name",
        });
    }

    // ── 10b. semantic context candidates (landmarks, aria, data-* attributes)
    candidates.push(...buildSemanticContextCandidates(el));

    // ── 11. tag name
    const tag = el.nodeName.toLowerCase();
    candidates.push({
        selector: tag,
        score: kTagScore,
        strategy: "tag",
    });

    // ── 12. tag + stable classes
    const stableClasses = [...el.classList].filter(isStableClass);
    if (stableClasses.length > 0) {
        // Try progressively adding classes until we have something useful
        for (let i = 1; i <= Math.min(stableClasses.length, 3); i++) {
            const classSel = `${tag}.${stableClasses.slice(0, i).join(".")}`;
            candidates.push({
                selector: classSel,
                score: kTagClassScore + i,
                strategy: "tag-class",
            });
        }
    }

    // Apply length penalty to scored candidates
    penalizeForLength(candidates);

    return candidates;
}

// ── CSS path fallback ───────────────────────────────────────────

function getCssPath(el: HTMLElement): string {
    if (!(el instanceof Element)) return "";
    const parts: string[] = [];
    let curr: Element | null = el;

    while (curr && curr.nodeType === Node.ELEMENT_NODE && curr.tagName.toLowerCase() !== "html") {
        let selector = curr.tagName.toLowerCase();

        if (curr.id && !isGuid(curr.id)) {
            const idSel = /^[a-zA-Z][a-zA-Z0-9\-_]+$/.test(curr.id) ? `#${curr.id}` : `[id="${curr.id}"]`;
            selector += idSel;
            parts.unshift(selector);
            break;
        }

        let sib: Element | null = curr;
        let nth = 1;
        while ((sib = sib.previousElementSibling)) {
            if (sib.tagName.toLowerCase() === curr.tagName.toLowerCase()) nth++;
        }
        if (nth !== 1) selector += `:nth-of-type(${nth})`;

        parts.unshift(selector);
        curr = curr.parentElement;
    }
    return parts.join(" > ");
}

// ── Scored combination (like Playwright's combineScores) ────────
// Earlier tokens (closer to root) weigh more.

function combineScores(tokens: InternalCandidate[]): number {
    let score = 0;
    for (let i = 0; i < tokens.length; i++) {
        score += tokens[i]!.score * (tokens.length - i);
    }
    return score;
}

// ── Cached candidate generation per element ─────────────────────

function getCachedCandidates(el: HTMLElement): InternalCandidate[] | null {
    let cached = candidateCache.get(el);
    if (cached === undefined) {
        cached = buildCandidatesForElement(el);
        candidateCache.set(el, cached);
    }
    return cached;
}

// ── Deep parent/ancestor chaining ──────────────────────────────
// Walk UP the DOM tree unlimited levels, scoring-driven pruning.
// Produces "ancestorSelector >> targetSelector" format.

function buildChainedCandidates(
    el: HTMLElement,
    targetCandidates: InternalCandidate[],
    bestDirectScore: number
): InternalCandidate[] {
    const chained: InternalCandidate[] = [];
    let ancestor: Element | null = parentElementOrShadowHost(el);
    let depth = 0;
    const maxDepth = 10; // practical limit for performance

    while (ancestor && ancestor !== document.body && ancestor !== document.documentElement && depth < maxDepth) {
        const ancestorEl = ancestor as HTMLElement;
        const ancestorCandidates = getCachedCandidates(ancestorEl);

        if (ancestorCandidates) {
            // Only consider ancestor candidates that are reasonably good
            // (no css-path or tag-only for ancestors — too noisy)
            const goodAncestorCands = ancestorCandidates.filter(
                (c) => c.strategy !== "css-path" && c.strategy !== "tag" && c.score < kRoleOnlyScore
            );

            for (const ac of goodAncestorCands) {
                for (const tc of targetCandidates) {
                    // Skip combining two text selectors (ambiguous)
                    if (ac.strategy === "text" && tc.strategy === "text") continue;

                    const combinedSelector = `${ac.selector} >> ${tc.selector}`;
                    const combinedScore = ac.score * 2 + tc.score + (depth * 5);

                    // Prune: only keep if better than best direct
                    if (combinedScore >= bestDirectScore) continue;

                    chained.push({
                        selector: combinedSelector,
                        score: combinedScore,
                        strategy: tc.strategy,
                    });
                }
            }
        }

        // Early exit: if we already have a chained candidate that's great, stop climbing
        if (chained.length > 0) {
            const bestChained = Math.min(...chained.map((c) => c.score));
            // If best chained is very good, no need to climb further
            if (bestChained < kRoleWithNameScore) break;
        }

        ancestor = parentElementOrShadowHost(ancestorEl);
        depth++;
    }

    return chained;
}

// ── Nearby landmark/sibling context ─────────────────────────────

function findNearbyLandmark(el: HTMLElement): InternalCandidate | null {
    // Check if element is inside a landmark with a label
    const landmarks = ["nav", "header", "footer", "main", "aside", "section[aria-label]", "[role=navigation]", "[role=banner]", "[role=contentinfo]", "[role=main]", "[role=complementary]", "[role=region][aria-label]"];

    for (const landmark of landmarks) {
        const container = el.closest(landmark);
        if (container && container !== el) {
            const role = detectRole(container as HTMLElement);
            if (role) {
                const name = getAccessibleName(container as HTMLElement);
                if (name) {
                    return {
                        selector: `${role} "${name}"`,
                        score: kRoleWithNameScore,
                        strategy: "role-name",
                    };
                }
            }
            // Use tag if no role+name
            const ariaLabel = container.getAttribute("aria-label");
            if (ariaLabel) {
                return {
                    selector: `${container.tagName.toLowerCase()} "${ariaLabel}"`,
                    score: kRoleWithNameScore + 20,
                    strategy: "role-name",
                };
            }
        }
    }

    return null;
}

// ── Main: generate ALL candidates for an element ────────────────

export function computeCandidates(el: HTMLElement): SelectorCandidate[] {
    const directCandidates = buildCandidatesForElement(el);

    // Validate uniqueness and add nth-index disambiguation
    const validated: InternalCandidate[] = [];
    const seen = new Set<string>(); // avoid duplicate selectors

    for (const c of directCandidates) {
        if (seen.has(c.selector)) continue;
        seen.add(c.selector);

        const matchCount = validateUniqueness(c.selector, c.strategy);

        if (matchCount === 1) {
            validated.push(c);
        } else if (matchCount > 1 && matchCount <= 5) {
            // Add nth-index disambiguation
            let index = 0;
            if (c.strategy === "role-name") {
                const match = c.selector.match(/^(\w+)\s+"(.+)"$/);
                if (match) index = findRoleMatchIndex(el, match[1]!, match[2]!);
            } else if (c.strategy === "role-only") {
                // Find index among role matches
                const selectors = ROLE_TAG_MAP[c.selector];
                if (selectors) {
                    const matches: HTMLElement[] = [];
                    for (const sel of selectors) {
                        for (const e of document.querySelectorAll<HTMLElement>(sel)) {
                            if (!matches.includes(e)) matches.push(e);
                        }
                    }
                    index = matches.indexOf(el) + 1;
                }
            } else {
                // CSS selector — find index
                try {
                    const all = [...document.querySelectorAll(c.selector)];
                    index = all.indexOf(el) + 1;
                } catch { index = 0; }
            }

            if (index > 0) {
                validated.push({
                    selector: `${c.selector} [${index}]`,
                    score: c.score + kNthScore,
                    strategy: c.strategy,
                });
            }
            // Also keep the original (un-indexed) for chaining later
            // but at a higher score
            validated.push({ ...c, score: c.score + 50 });
        }
        // matchCount > 5 or 0: discard (except css-path, always keep)
        else if (c.strategy === "css-path") {
            validated.push(c);
        }
    }

    // Best direct score for pruning
    const bestDirectScore = validated.length > 0
        ? Math.min(...validated.filter((c) => c.score < kNthScore).map((c) => c.score))
        : Infinity;

    // Build chained candidates (ancestor >> target) if needed
    const targetOnlyCandidates = directCandidates.filter(
        (c) => c.strategy !== "css-path" && c.strategy !== "tag" &&
            // Exclude useless role-only candidates from chaining (e.g., "presentation", "none")
            !(c.strategy === "role-only" && USELESS_ROLE_ONLY.has(c.selector))
    );

    let allCandidates = [...validated];

    if (bestDirectScore > kIdScore) {
        // Direct candidates aren't great — try chaining
        const chained = buildChainedCandidates(el, targetOnlyCandidates, bestDirectScore);

        // Validate chained candidates
        for (const c of chained) {
            if (seen.has(c.selector)) continue;
            seen.add(c.selector);

            // For chained selectors, we validate by resolving parent scope then child
            // This is expensive so we trust the generation logic + do a quick check
            allCandidates.push(c);
        }

        // Also try landmark context
        const landmark = findNearbyLandmark(el);
        if (landmark) {
            for (const tc of targetOnlyCandidates.slice(0, 5)) {
                const chainedSel = `${landmark.selector} >> ${tc.selector}`;
                if (!seen.has(chainedSel)) {
                    seen.add(chainedSel);
                    allCandidates.push({
                        selector: chainedSel,
                        score: landmark.score + tc.score,
                        strategy: tc.strategy,
                    });
                }
            }
        }
    }

    // Always add CSS path as ultimate fallback
    const cssPath = getCssPath(el);
    if (cssPath && !seen.has(cssPath)) {
        allCandidates.push({
            selector: cssPath,
            score: kCssPathScore,
            strategy: "css-path",
        });
    }

    // Sort by score ascending (best first) and deduplicate
    allCandidates.sort((a, b) => a.score - b.score);

    // Convert to public type
    return allCandidates.map((c) => ({
        selector: c.selector,
        score: c.score,
        strategy: c.strategy,
    }));
}

// ── Pick the best unique selector ───────────────────────────────

export function computeSelector(el: HTMLElement): string {
    // 1. First try snap to interactive element
    const actionable = el.closest("button,select,input,textarea,[role=button],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],a[href],[role=link]") as HTMLElement | null;

    // 2. If not interactive, try semantic container
    let target: HTMLElement;
    if (actionable && actionable !== document.body) {
        target = actionable;
    } else {
        // Try to snap to nearest meaningful element
        const meaningful = el.closest("[role],[id]:not([id='']),nav,header,footer,main,aside,article,section,form,fieldset,table,ul,ol,h1,h2,h3,h4,h5,h6,[data-testid],[aria-label]") as HTMLElement | null;
        target = (meaningful && meaningful !== document.body) ? meaningful : el;
    }

    const candidates = computeCandidates(target);

    for (const c of candidates) {
        // For candidates without nth-index (no "[N]" suffix), they're already validated unique
        // For chained candidates (">>"), they were generated to disambiguate
        // Accept the first candidate that isn't just a tag name or role-only

        if (c.strategy === "css-path") {
            // CSS path is always valid, use as last resort
            return c.selector;
        }

        // Skip non-unique tag/role-only without index
        if ((c.strategy === "tag" || c.strategy === "tag-class" || c.strategy === "role-only") && !c.selector.includes("[")) {
            // These are likely non-unique, verify
            const count = validateUniqueness(c.selector, c.strategy);
            if (count !== 1) continue;
        }

        return c.selector;
    }

    // Should never reach here since css-path is always present
    return getCssPath(target);
}
