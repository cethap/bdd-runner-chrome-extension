/**
 * Compute the accessible name of a DOM element.
 * Follows a simplified version of the WAI-ARIA accessible name computation:
 *  1. aria-label
 *  2. aria-labelledby
 *  3. <label> for inputs
 *  4. placeholder (for inputs)
 *  5. value (for submit/button inputs)
 *  6. alt (for images)
 *  7. title attribute
 *  8. textContent fallback
 *
 * Used directly in the recorder content script.
 * For CDP Runtime.evaluate, use `ACCESSIBLE_NAME_FN_JS` instead.
 */
export function getAccessibleName(el: HTMLElement): string {
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

/**
 * The getAccessibleName function body as a JS string, for embedding in
 * CDP Runtime.evaluate expressions. This avoids duplicating the logic
 * as hand-written string literals in cdp-client.ts.
 *
 * Usage in a Runtime.evaluate expression:
 *   `function getAccessibleName(el) { ${ACCESSIBLE_NAME_FN_BODY} }`
 */
export const ACCESSIBLE_NAME_FN_BODY = `
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
`;
