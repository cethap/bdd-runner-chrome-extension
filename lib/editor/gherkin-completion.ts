import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";

const KEYWORDS: Completion[] = [
  { label: "Feature:", type: "keyword", detail: "top-level feature" },
  {
    label: "Background:",
    type: "keyword",
    detail: "runs before each scenario",
  },
  { label: "Scenario:", type: "keyword", detail: "test scenario" },
  {
    label: "Scenario Outline:",
    type: "keyword",
    detail: "parameterized scenario",
  },
  { label: "Examples:", type: "keyword", detail: "data table for outline" },
  { label: "Rule:", type: "keyword", detail: "business rule grouping" },
  { label: "Given ", type: "keyword", detail: "precondition" },
  { label: "When ", type: "keyword", detail: "action" },
  { label: "Then ", type: "keyword", detail: "assertion" },
  { label: "And ", type: "keyword", detail: "continuation" },
  { label: "But ", type: "keyword", detail: "negative continuation" },
  { label: '* ', type: "keyword", detail: "generic step" },
];

const HTTP_STEP_TEMPLATES: Completion[] = [
  {
    label: "url '",
    type: "function",
    detail: "set base URL",
    apply: "url 'https://'",
  },
  {
    label: "method GET",
    type: "function",
    detail: "HTTP GET request",
  },
  {
    label: "method POST",
    type: "function",
    detail: "HTTP POST request",
  },
  {
    label: "method PUT",
    type: "function",
    detail: "HTTP PUT request",
  },
  {
    label: "method DELETE",
    type: "function",
    detail: "HTTP DELETE request",
  },
  {
    label: "method PATCH",
    type: "function",
    detail: "HTTP PATCH request",
  },
  {
    label: "header ",
    type: "function",
    detail: "set request header",
    apply: "header Content-Type = 'application/json'",
  },
  {
    label: "param ",
    type: "function",
    detail: "set query parameter",
    apply: "param key = 'value'",
  },
  {
    label: "request ",
    type: "function",
    detail: "set request body",
    apply: "request {}",
  },
  {
    label: "status ",
    type: "function",
    detail: "assert response status",
    apply: "status 200",
  },
  {
    label: "match response",
    type: "function",
    detail: "assert response body",
    apply: "match response == ",
  },
  {
    label: "match response contains",
    type: "function",
    detail: "partial match response",
    apply: "match response contains ",
  },
  {
    label: "def ",
    type: "variable",
    detail: "save variable",
    apply: "def varName = response.",
  },
  {
    label: "print ",
    type: "variable",
    detail: "log value",
    apply: "print response",
  },
  {
    label: "eval",
    type: "function",
    detail: "execute inline Lua code",
    apply: 'eval\n  """\n  \n  """',
  },
  {
    label: "script ",
    type: "function",
    detail: "run stored Lua script",
    apply: "script ''",
  },
  {
    label: "def ",
    type: "variable",
    detail: "capture Lua return value",
    apply: 'def result = eval\n  """\n  return \n  """',
    boost: -1,
  },
];

const BROWSER_STEP_TEMPLATES: Completion[] = [
  {
    label: "browser open",
    type: "function",
    detail: "open new tab and navigate",
    apply: "browser open 'https://'",
  },
  {
    label: "browser navigate to",
    type: "function",
    detail: "navigate current tab",
    apply: "browser navigate to 'https://'",
  },
  {
    label: "browser click",
    type: "function",
    detail: "click element by selector",
    apply: "browser click ''",
  },
  {
    label: "browser fill",
    type: "function",
    detail: "type text into input",
    apply: "browser fill '' with ''",
  },
  {
    label: "browser text",
    type: "function",
    detail: "assert element text",
    apply: "browser text '' == ''",
  },
  {
    label: "browser text contains",
    type: "function",
    detail: "assert text contains",
    apply: "browser text '' contains ''",
    boost: -1,
  },
  {
    label: "browser visible",
    type: "function",
    detail: "assert element visible",
    apply: "browser visible ''",
  },
  {
    label: "browser not visible",
    type: "function",
    detail: "assert element not visible",
    apply: "browser not visible ''",
  },
  {
    label: "browser screenshot",
    type: "function",
    detail: "capture page screenshot",
  },
  {
    label: "browser wait for",
    type: "function",
    detail: "wait for element",
    apply: "browser wait for ''",
  },
  {
    label: "browser select",
    type: "function",
    detail: "select dropdown option",
    apply: "browser select '' value ''",
  },
  {
    label: "browser check",
    type: "function",
    detail: "check checkbox",
    apply: "browser check ''",
  },
  {
    label: "browser uncheck",
    type: "function",
    detail: "uncheck checkbox",
    apply: "browser uncheck ''",
  },
  {
    label: "browser press",
    type: "function",
    detail: "press key (Enter, Tab, etc.)",
    apply: "browser press 'Enter'",
  },
  {
    label: "browser close",
    type: "function",
    detail: "close browser tab",
  },
  {
    label: "def = browser text",
    type: "variable",
    detail: "capture element text",
    apply: "def varName = browser text ''",
    boost: -1,
  },
  {
    label: "def = browser value",
    type: "variable",
    detail: "capture input value",
    apply: "def varName = browser value ''",
    boost: -1,
  },
];

export function gherkinCompletion(
  context: CompletionContext,
): CompletionResult | null {
  // Match from start of line (after optional whitespace)
  const lineMatch = context.matchBefore(/^\s*\S*/);
  if (!lineMatch) return null;

  const trimmed = lineMatch.text.trimStart();

  // Don't complete empty lines if no input
  if (trimmed.length === 0 && !context.explicit) return null;

  // After a step keyword, offer HTTP step templates
  const afterKeyword = context.matchBefore(
    /(?:Given|When|Then|And|But|\*)\s+.*/,
  );
  if (afterKeyword) {
    const stepText = afterKeyword.text.replace(
      /^(?:Given|When|Then|And|But|\*)\s+/,
      "",
    );
    const from = afterKeyword.from + afterKeyword.text.indexOf(stepText);

    if (stepText.length === 0 && !context.explicit) return null;

    return {
      from,
      options: [...HTTP_STEP_TEMPLATES, ...BROWSER_STEP_TEMPLATES].filter(
        (t) =>
          stepText.length === 0 ||
          t.label.toLowerCase().startsWith(stepText.toLowerCase()),
      ),
    };
  }

  // At start of line, offer keywords
  return {
    from: lineMatch.from + (lineMatch.text.length - trimmed.length),
    options: KEYWORDS,
  };
}
