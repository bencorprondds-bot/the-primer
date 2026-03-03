/**
 * Error Memory System — Reflexion Pattern (v1)
 *
 * After each failed task attempt, the agent generates a verbal lesson.
 * The system stores these reflections, detects patterns, and makes
 * relevant lessons available for future attempts.
 *
 * Progression:
 * v1 (this): Reflexion pattern — verbal self-reflection per failure
 * v2 (Phase 5): MNL pattern — cluster failures into abstract patterns
 * v3 (Phase 7): AgentDebug pattern — root cause taxonomy tagging
 *
 * Based on:
 * - Reflexion (Shinn 2023) — verbal reinforcement learning
 * - failure-memory skill — R/C/D counter tracking
 * - Mistake Notebook Learning — batch-clustered abstraction
 */

import { db } from "./db.js";

// ─── Types ───────────────────────────────────────────────────

export interface ReflectionInput {
  agentId: string;
  taskAttemptId?: string;
  capabilitySlug: string;
  content: string;          // The agent's verbal lesson (100-200 tokens)
  errorType?: ErrorTypeTag;
}

export type ErrorTypeTag =
  | "TOOL_SELECTION"
  | "ARGUMENT_ERROR"
  | "INTERPRETATION"
  | "PLANNING"
  | "MEMORY"
  | "SYSTEM"
  | "UNKNOWN";

export interface RelevantReflection {
  content: string;
  recurrence: number;
  isConstraint: boolean;
}

// ─── Core Functions ──────────────────────────────────────────

/**
 * Store a new reflection after a failed task attempt.
 *
 * Checks for similarity with existing reflections:
 * - If similar reflection exists (>= threshold), increment recurrence
 * - If new pattern, create a fresh reflection
 */
export async function storeReflection(input: ReflectionInput): Promise<void> {
  // Check for similar existing reflections
  const existing = await db.reflection.findMany({
    where: {
      agentId: input.agentId,
      capabilitySlug: input.capabilitySlug,
    },
    orderBy: { recurrence: "desc" },
  });

  // Simple similarity check: look for substantial keyword overlap
  const similar = existing.find((r) => isSimilar(r.content, input.content));

  if (similar) {
    // Increment recurrence and update content if the new one is better
    await db.reflection.update({
      where: { id: similar.id },
      data: {
        recurrence: { increment: 1 },
        content: input.content.length > similar.content.length
          ? input.content
          : similar.content,
        errorType: input.errorType ?? similar.errorType,
        // Check if should promote to constraint
        promotedToConstraint: (similar.recurrence + 1) >= 3 && similar.confirmations >= 2,
      },
    });
  } else {
    // New pattern
    await db.reflection.create({
      data: {
        agentId: input.agentId,
        taskAttemptId: input.taskAttemptId,
        capabilitySlug: input.capabilitySlug,
        content: input.content,
        errorType: input.errorType ?? "UNKNOWN",
        recurrence: 1,
        confirmations: 0,
        disconfirmations: 0,
      },
    });
  }
}

/**
 * Retrieve relevant reflections for an upcoming task.
 *
 * Returns reflections from the same capability area,
 * ordered by relevance (promoted constraints first, then recurrence).
 *
 * @param agentId - The agent to retrieve reflections for
 * @param capabilitySlug - The capability being tested
 * @param limit - Max reflections to return (default: 5)
 */
export async function getRelevantReflections(
  agentId: string,
  capabilitySlug: string,
  limit: number = 5
): Promise<RelevantReflection[]> {
  const reflections = await db.reflection.findMany({
    where: {
      agentId,
      capabilitySlug,
    },
    orderBy: [
      { promotedToConstraint: "desc" },
      { recurrence: "desc" },
      { updatedAt: "desc" },
    ],
    take: limit,
  });

  return reflections.map((r) => ({
    content: r.content,
    recurrence: r.recurrence,
    isConstraint: r.promotedToConstraint,
  }));
}

/**
 * Confirm a reflection (the lesson was validated as correct).
 * Used when the agent succeeds after applying a lesson.
 */
export async function confirmReflection(reflectionId: string): Promise<void> {
  const reflection = await db.reflection.findUnique({
    where: { id: reflectionId },
  });
  if (!reflection) return;

  await db.reflection.update({
    where: { id: reflectionId },
    data: {
      confirmations: { increment: 1 },
      // Auto-promote if thresholds met
      promotedToConstraint:
        reflection.recurrence >= 3 && (reflection.confirmations + 1) >= 2,
    },
  });
}

/**
 * Disconfirm a reflection (the lesson was wrong or unhelpful).
 */
export async function disconfirmReflection(reflectionId: string): Promise<void> {
  await db.reflection.update({
    where: { id: reflectionId },
    data: {
      disconfirmations: { increment: 1 },
    },
  });
}

/**
 * Format reflections as context for the agent.
 *
 * Returns a string that can be prepended to the task prompt,
 * giving the agent its own past lessons.
 */
export function formatReflectionsAsContext(reflections: RelevantReflection[]): string {
  if (reflections.length === 0) return "";

  const lines = reflections.map((r) => {
    const prefix = r.isConstraint ? "[CONSTRAINT]" : `[lesson, seen ${r.recurrence}x]`;
    return `${prefix} ${r.content}`;
  });

  return [
    "--- Your past lessons for this capability ---",
    ...lines,
    "--- End lessons ---",
    "",
  ].join("\n");
}

// ─── Similarity Detection ────────────────────────────────────

/**
 * Simple keyword-overlap similarity check.
 *
 * In v2 (MNL pattern), this would use embeddings for semantic similarity.
 * For v1, keyword overlap >= 0.5 is "similar enough."
 */
function isSimilar(a: string, b: string, threshold = 0.5): boolean {
  const wordsA = extractKeywords(a);
  const wordsB = extractKeywords(b);

  if (wordsA.size === 0 || wordsB.size === 0) return false;

  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }

  const similarity = overlap / Math.max(wordsA.size, wordsB.size);
  return similarity >= threshold;
}

function extractKeywords(text: string): Set<string> {
  const stopWords = new Set([
    "the", "a", "an", "is", "was", "are", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "above", "below", "between", "and", "but", "or",
    "not", "no", "nor", "so", "yet", "both", "either", "neither", "each",
    "every", "all", "any", "few", "more", "most", "other", "some", "such",
    "than", "too", "very", "just", "also", "i", "it", "its", "this", "that",
  ]);

  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w))
  );
}
