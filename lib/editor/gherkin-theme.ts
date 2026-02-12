import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const gherkinColors = {
  bg: "#1e1e2e",
  gutterBg: "#181825",
  gutterText: "#6c7086",
  selection: "#45475a",
  cursor: "#f5e0dc",
  activeLine: "#262637",
  matchingBracket: "#45475a",
  keyword: "#cba6f7",
  string: "#a6e3a1",
  comment: "#6c7086",
  meta: "#f9e2af",
  variable: "#89b4fa",
  number: "#fab387",
  type: "#f38ba8",
  operator: "#45475a",
  text: "#cdd6f4",
};

export const gherkinTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: gherkinColors.bg,
      color: gherkinColors.text,
    },
    ".cm-content": {
      caretColor: gherkinColors.cursor,
      padding: "8px 0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: gherkinColors.cursor,
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      {
        backgroundColor: gherkinColors.selection,
      },
    ".cm-gutters": {
      backgroundColor: gherkinColors.gutterBg,
      color: gherkinColors.gutterText,
      border: "none",
      minWidth: "36px",
    },
    ".cm-activeLineGutter": {
      backgroundColor: gherkinColors.activeLine,
      color: gherkinColors.text,
    },
    ".cm-activeLine": {
      backgroundColor: gherkinColors.activeLine,
    },
    "&.cm-focused .cm-matchingBracket": {
      backgroundColor: gherkinColors.matchingBracket,
    },
    ".cm-tooltip": {
      backgroundColor: gherkinColors.gutterBg,
      border: `1px solid ${gherkinColors.selection}`,
      color: gherkinColors.text,
    },
    ".cm-tooltip-autocomplete": {
      "& > ul > li": {
        padding: "2px 8px",
      },
      "& > ul > li[aria-selected]": {
        backgroundColor: gherkinColors.selection,
        color: gherkinColors.text,
      },
    },
    ".cm-tooltip .cm-completionDetail": {
      color: gherkinColors.gutterText,
      fontStyle: "normal",
      marginLeft: "8px",
    },
  },
  { dark: true },
);

export const gherkinHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.keyword, color: gherkinColors.keyword, fontWeight: "bold" },
    { tag: tags.string, color: gherkinColors.string },
    { tag: tags.comment, color: gherkinColors.comment, fontStyle: "italic" },
    { tag: tags.meta, color: gherkinColors.meta },
    { tag: tags.variableName, color: gherkinColors.variable },
    { tag: tags.number, color: gherkinColors.number },
    { tag: tags.typeName, color: gherkinColors.type },
    { tag: tags.operator, color: gherkinColors.operator },
  ]),
);
