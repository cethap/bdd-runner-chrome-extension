import { StreamLanguage, type StreamParser } from "@codemirror/language";

type GherkinState = {
  inDocString: boolean;
  inTable: boolean;
  docStringDelimiter: string;
};

const gherkinParser: StreamParser<GherkinState> = {
  startState(): GherkinState {
    return { inDocString: false, inTable: false, docStringDelimiter: "" };
  },

  token(stream, state): string | null {
    // Doc string blocks — must check BEFORE anything else
    if (state.inDocString) {
      const escaped = state.docStringDelimiter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (stream.match(new RegExp(`^\\s*${escaped}$`))) {
        state.inDocString = false;
        state.docStringDelimiter = "";
        return "string";
      }
      stream.skipToEnd();
      return "string";
    }

    // Check for doc string start — must run BEFORE eatSpace/quote matching
    if (stream.match(/^\s*"""/)) {
      state.inDocString = true;
      state.docStringDelimiter = '"""';
      return "string";
    }
    if (stream.match(/^\s*```/)) {
      state.inDocString = true;
      state.docStringDelimiter = "```";
      return "string";
    }

    // Skip whitespace
    if (stream.eatSpace()) return null;

    // Comments
    if (stream.match("#")) {
      stream.skipToEnd();
      return "comment";
    }

    // Tags (@tag)
    if (stream.match(/@[\w\-]+/)) {
      return "meta";
    }

    // Table rows
    if (stream.peek() === "|") {
      stream.next();
      return "operator";
    }

    // Feature-level keywords
    if (stream.sol() || /^\s*$/.test(stream.string.slice(0, stream.pos))) {
      if (
        stream.match(
          /^(Feature|Background|Scenario|Scenario Outline|Examples|Rule):/,
        )
      ) {
        return "keyword";
      }

      // Step keywords
      if (stream.match(/^(Given|When|Then|And|But|)\s/)) {
        return "keyword";
      }
    }

    // Quoted strings
    if (stream.match(/"[^"]*"/)) {
      return "string";
    }
    if (stream.match(/'[^']*'/)) {
      return "string";
    }

    // Angle bracket params <param>
    if (stream.match(/<[^>]+>/)) {
      return "variableName";
    }

    // Numbers
    if (stream.match(/\b\d+(\.\d+)?\b/)) {
      return "number";
    }

    // Type markers (#number, #string, etc.)
    if (stream.match(/#(number|string|boolean|null|notnull|present|array)/)) {
      return "typeName";
    }

    // Everything else
    stream.next();
    return null;
  },
};

export const gherkinLanguage = StreamLanguage.define(gherkinParser);
