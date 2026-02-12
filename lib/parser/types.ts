export type ParsedStep = {
  keyword: string;
  text: string;
  docString?: string;
  dataTable?: string[][];
  line: number;
};

export type ParsedScenario = {
  name: string;
  tags: string[];
  steps: ParsedStep[];
  line: number;
  examples?: ParsedExamples[];
};

export type ParsedExamples = {
  name: string;
  tags: string[];
  tableHeader: string[];
  tableBody: string[][];
  line: number;
};

export type ParsedBackground = {
  name: string;
  steps: ParsedStep[];
  line: number;
};

export type ParsedFeature = {
  name: string;
  description: string;
  tags: string[];
  background?: ParsedBackground;
  scenarios: ParsedScenario[];
  line: number;
};

export type ParseError = {
  message: string;
  line: number;
  column: number;
};

export type ParseResult =
  | { ok: true; feature: ParsedFeature }
  | { ok: false; errors: ParseError[] };
