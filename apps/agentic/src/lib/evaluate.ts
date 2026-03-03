/**
 * Rubric-based evaluation engine for agent task responses.
 *
 * Supports 6 criterion types for tool-use evaluation:
 * - tool_selected: Did the agent choose the correct tool?
 * - argument_valid: Were the arguments correct?
 * - result_correct: Did the response contain the expected result?
 * - format_correct: Was the response in the expected format?
 * - error_handled: Did the agent handle errors appropriately?
 * - sequence_valid: Were tool calls in the correct order?
 */

export interface Criterion {
  type: CriterionType;
  weight: number;
  expected?: string | string[];
  key?: string;          // For argument checking: which argument
  pattern?: string;      // Regex pattern for matching
  description?: string;  // Human-readable description
}

export type CriterionType =
  | "tool_selected"
  | "argument_valid"
  | "result_correct"
  | "format_correct"
  | "error_handled"
  | "sequence_valid";

export interface Rubric {
  criteria: Criterion[];
  passThreshold?: number; // Score >= this = correct (default 0.7)
}

export interface EvaluationResult {
  score: number;           // Weighted score [0.0, 1.0]
  correct: boolean;        // score >= passThreshold
  criteriaScores: Record<string, number>; // Per-criterion scores
  notes: string;           // Explanation
}

interface AgentResponse {
  toolCalls?: ToolCall[];
  text?: string;
  [key: string]: unknown;
}

interface ToolCall {
  tool: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
}

/**
 * Evaluate an agent's response against a rubric.
 */
export function evaluate(response: AgentResponse, rubric: Rubric): EvaluationResult {
  const criteriaScores: Record<string, number> = {};
  const notes: string[] = [];
  let totalWeight = 0;
  let weightedSum = 0;

  for (const criterion of rubric.criteria) {
    const key = `${criterion.type}${criterion.key ? `:${criterion.key}` : ""}`;
    const score = evaluateCriterion(criterion, response);
    criteriaScores[key] = score;
    totalWeight += criterion.weight;
    weightedSum += score * criterion.weight;

    if (score < 1.0) {
      notes.push(`${key}: ${score.toFixed(2)} — ${criterion.description || criterion.type}`);
    }
  }

  const finalScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const passThreshold = rubric.passThreshold ?? 0.7;

  return {
    score: Math.round(finalScore * 1000) / 1000,
    correct: finalScore >= passThreshold,
    criteriaScores,
    notes: notes.length > 0 ? notes.join("; ") : "All criteria met",
  };
}

function evaluateCriterion(criterion: Criterion, response: AgentResponse): number {
  switch (criterion.type) {
    case "tool_selected":
      return evaluateToolSelected(criterion, response);
    case "argument_valid":
      return evaluateArgumentValid(criterion, response);
    case "result_correct":
      return evaluateResultCorrect(criterion, response);
    case "format_correct":
      return evaluateFormatCorrect(criterion, response);
    case "error_handled":
      return evaluateErrorHandled(criterion, response);
    case "sequence_valid":
      return evaluateSequenceValid(criterion, response);
    default:
      return 0;
  }
}

function evaluateToolSelected(criterion: Criterion, response: AgentResponse): number {
  if (!response.toolCalls?.length) return 0;
  const expected = Array.isArray(criterion.expected) ? criterion.expected : [criterion.expected];
  const selectedTools = response.toolCalls.map((tc) => tc.tool);

  // Check if any selected tool matches any expected tool
  for (const exp of expected) {
    if (exp && selectedTools.some((t) => t === exp || t.includes(exp as string))) {
      return 1.0;
    }
  }
  return 0;
}

function evaluateArgumentValid(criterion: Criterion, response: AgentResponse): number {
  if (!response.toolCalls?.length || !criterion.key) return 0;

  for (const tc of response.toolCalls) {
    const argValue = tc.arguments?.[criterion.key];
    if (argValue === undefined) continue;

    if (criterion.expected) {
      const expected = Array.isArray(criterion.expected) ? criterion.expected : [criterion.expected];
      const argStr = String(argValue);
      if (expected.some((exp) => argStr === exp || argStr.includes(exp as string))) {
        return 1.0;
      }
    } else if (criterion.pattern) {
      const regex = new RegExp(criterion.pattern);
      if (regex.test(String(argValue))) {
        return 1.0;
      }
    } else {
      // Just check the argument exists and is non-empty
      return argValue !== null && argValue !== "" ? 1.0 : 0;
    }
  }
  return 0;
}

function evaluateResultCorrect(criterion: Criterion, response: AgentResponse): number {
  const text = response.text || "";
  const lastResult = response.toolCalls?.at(-1)?.result;
  const searchable = `${text} ${JSON.stringify(lastResult || "")}`;

  if (criterion.expected) {
    const expected = Array.isArray(criterion.expected) ? criterion.expected : [criterion.expected];
    return expected.some((exp) => searchable.includes(exp as string)) ? 1.0 : 0;
  }
  if (criterion.pattern) {
    return new RegExp(criterion.pattern).test(searchable) ? 1.0 : 0;
  }
  return searchable.trim().length > 0 ? 0.5 : 0;
}

function evaluateFormatCorrect(criterion: Criterion, response: AgentResponse): number {
  if (criterion.pattern) {
    const text = response.text || JSON.stringify(response);
    return new RegExp(criterion.pattern).test(text) ? 1.0 : 0;
  }
  // Check if response has tool calls (expected format for tool-use tasks)
  if (response.toolCalls?.length) return 1.0;
  return 0;
}

function evaluateErrorHandled(criterion: Criterion, response: AgentResponse): number {
  if (!response.toolCalls?.length) return 0;

  // Check if any tool call resulted in an error
  const hasErrors = response.toolCalls.some((tc) => {
    const result = String(tc.result || "");
    return result.includes("error") || result.includes("Error") || result.includes("ENOENT");
  });

  if (!hasErrors) return 1.0; // No errors to handle = pass

  // Check if agent took corrective action after error
  const errorIndex = response.toolCalls.findIndex((tc) => {
    const result = String(tc.result || "");
    return result.includes("error") || result.includes("Error");
  });

  // Did the agent make another tool call after the error?
  if (errorIndex >= 0 && errorIndex < response.toolCalls.length - 1) {
    return 1.0; // Attempted recovery
  }
  return 0;
}

function evaluateSequenceValid(criterion: Criterion, response: AgentResponse): number {
  if (!response.toolCalls?.length) return 0;
  if (!criterion.expected || !Array.isArray(criterion.expected)) return 1.0;

  const actual = response.toolCalls.map((tc) => tc.tool);
  const expected = criterion.expected as string[];

  // Check if actual sequence contains expected subsequence in order.
  // Each expected step is treated as a regex pattern, so "grep|search"
  // matches either tool name. This prevents rubric strictness when
  // multiple tools serve the same function (e.g., grep vs search).
  let expectedIdx = 0;
  for (const tool of actual) {
    if (expectedIdx < expected.length) {
      const pattern = new RegExp(`^(?:${expected[expectedIdx]})$`);
      if (pattern.test(tool)) {
        expectedIdx++;
      }
    }
  }
  return expectedIdx >= expected.length ? 1.0 : expectedIdx / expected.length;
}
