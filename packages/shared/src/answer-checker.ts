/**
 * Answer normalization and comparison for The Primer.
 *
 * Handles whitespace around operators, numeric equivalence,
 * and common formatting variations students might use.
 */

/**
 * Normalize an answer string for comparison.
 * - Trim and lowercase
 * - Strip $ signs (KaTeX artifacts)
 * - Normalize whitespace around operators (+, -, *, /, =, <, >)
 * - Remove commas from numbers (3,266 → 3266)
 * - Collapse multiple spaces to single space
 */
export function normalizeAnswer(input: string): string {
  let s = input.trim().toLowerCase();

  // Strip dollar signs
  s = s.replace(/\$/g, "");

  // Remove commas between digits (e.g., 3,266 → 3266)
  s = s.replace(/(\d),(\d)/g, "$1$2");

  // Normalize whitespace around math operators: remove spaces around +, -, *, /, =, <, >
  s = s.replace(/\s*([+\-*/=<>])\s*/g, "$1");

  // Collapse remaining multiple spaces
  s = s.replace(/\s+/g, " ");

  return s.trim();
}

/**
 * Check if two strings represent the same number.
 * Handles: 0.5 vs .5, 0.50 vs 0.5, etc.
 */
export function numericEquals(a: string, b: string): boolean {
  const numA = parseFloat(a);
  const numB = parseFloat(b);
  if (isNaN(numA) || isNaN(numB)) return false;
  return Math.abs(numA - numB) < 1e-9;
}

/**
 * Check a student's answer against the correct answer and acceptable formats.
 *
 * Tries (in order):
 * 1. Normalized string match against correctAnswer
 * 2. Normalized string match against each acceptableFormat
 * 3. Numeric equality (if both sides parse as numbers)
 */
export function checkAnswer(
  studentAnswer: string,
  correctAnswer: string,
  acceptableFormats?: string[]
): boolean {
  const normalized = normalizeAnswer(studentAnswer);
  const normalizedCorrect = normalizeAnswer(correctAnswer);

  // Exact normalized match
  if (normalized === normalizedCorrect) return true;

  // Check acceptable formats
  if (acceptableFormats?.some((f) => normalized === normalizeAnswer(f))) {
    return true;
  }

  // Numeric equivalence
  if (numericEquals(normalized, normalizedCorrect)) return true;

  return false;
}
