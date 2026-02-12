import {
  Parser,
  AstBuilder,
  GherkinClassicTokenMatcher,
} from "@cucumber/gherkin";
import { IdGenerator } from "@cucumber/messages";
import type * as messages from "@cucumber/messages";
import type {
  ParseResult,
  ParsedFeature,
  ParsedScenario,
  ParsedStep,
  ParsedBackground,
  ParsedExamples,
} from "./types";

function convertStep(step: messages.Step): ParsedStep {
  const result: ParsedStep = {
    keyword: step.keyword.trim(),
    text: step.text,
    line: step.location.line,
  };

  if (step.docString) {
    result.docString = step.docString.content;
  }

  if (step.dataTable) {
    result.dataTable = step.dataTable.rows.map((row) =>
      row.cells.map((cell) => cell.value),
    );
  }

  return result;
}

function convertBackground(bg: messages.Background): ParsedBackground {
  return {
    name: bg.name,
    steps: bg.steps.map(convertStep),
    line: bg.location.line,
  };
}

function convertExamples(examples: messages.Examples): ParsedExamples {
  return {
    name: examples.name,
    tags: examples.tags.map((t) => t.name),
    tableHeader: examples.tableHeader
      ? examples.tableHeader.cells.map((c) => c.value)
      : [],
    tableBody: examples.tableBody.map((row) =>
      row.cells.map((c) => c.value),
    ),
    line: examples.location.line,
  };
}

function convertScenario(scenario: messages.Scenario): ParsedScenario {
  const result: ParsedScenario = {
    name: scenario.name,
    tags: scenario.tags.map((t) => t.name),
    steps: scenario.steps.map(convertStep),
    line: scenario.location.line,
  };

  if (scenario.examples.length > 0) {
    result.examples = scenario.examples.map(convertExamples);
  }

  return result;
}

export function parseGherkin(source: string): ParseResult {
  try {
    const newId = IdGenerator.incrementing();
    const builder = new AstBuilder(newId);
    const matcher = new GherkinClassicTokenMatcher();
    const parser = new Parser(builder, matcher);

    const gherkinDocument = parser.parse(source);

    if (!gherkinDocument.feature) {
      return {
        ok: false,
        errors: [{ message: "No feature found in document", line: 1, column: 1 }],
      };
    }

    const feature = gherkinDocument.feature;
    let background: ParsedBackground | undefined;
    const scenarios: ParsedScenario[] = [];

    for (const child of feature.children) {
      if (child.background) {
        background = convertBackground(child.background);
      }
      if (child.scenario) {
        scenarios.push(convertScenario(child.scenario));
      }
      if (child.rule) {
        for (const ruleChild of child.rule.children) {
          if (ruleChild.background) {
            background = convertBackground(ruleChild.background);
          }
          if (ruleChild.scenario) {
            scenarios.push(convertScenario(ruleChild.scenario));
          }
        }
      }
    }

    const parsed: ParsedFeature = {
      name: feature.name,
      description: feature.description,
      tags: feature.tags.map((t) => t.name),
      scenarios,
      line: feature.location.line,
    };

    if (background) {
      parsed.background = background;
    }

    return { ok: true, feature: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Cucumber parser errors include line/column info
    const lineMatch = message.match(/\((\d+):(\d+)\)/);
    const line = lineMatch ? parseInt(lineMatch[1]!, 10) : 1;
    const column = lineMatch ? parseInt(lineMatch[2]!, 10) : 1;

    return {
      ok: false,
      errors: [{ message, line, column }],
    };
  }
}
