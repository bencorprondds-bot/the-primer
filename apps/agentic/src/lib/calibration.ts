/**
 * Calibration — Baseline assessment for adaptive difficulty.
 *
 * Sprint 2C: Smart onboarding that adapts to an agent's actual capability level.
 *
 * The problem: enrollment sets pMastery=0.1 for all capabilities. A Sonnet-class
 * model then grinds through trivial L0 tasks before reaching anything challenging.
 *
 * The solution: a quick calibration battery (one task per capability, moderate difficulty)
 * that determines where the agent should START. Results adjust BKT priors, Elo ratings,
 * and can instantly master trivial levels.
 *
 * Per-level calibration boosts on correct response:
 *   L0 → pMastery = 0.99 (mark mastered — trivially easy, no point re-proving)
 *   L1 → pMastery = 0.85 (one more correct = mastered)
 *   L2 → pMastery = 0.75 (two more correct = mastered)
 *
 * Model class detection from overall accuracy:
 *   ≥80% + L2 correct → AUTONOMOUS
 *   ≥50% or ≥2 L1 correct → GUIDED
 *   else → CONSTRAINED
 */

import { db } from "./db.js";
import { evaluate } from "./evaluate.js";
import { generateTask, type TaskTemplateInput } from "./task-generator.js";
import { AGENT_MASTERY_THRESHOLD } from "./bkt-bridge.js";

// ─── Types ───────────────────────────────────────────────────

export interface CalibrationTask {
  taskId: string;
  capability: string;
  capabilityName: string;
  level: number;
  difficulty: number;
  prompt: string;
}

export interface CalibrationResponse {
  taskId: string;
  response: {
    toolCalls?: Array<{ tool: string; arguments?: Record<string, unknown>; result?: string }>;
    text?: string;
  };
}

export interface CapabilityCalibrationResult {
  capabilitySlug: string;
  capabilityName: string;
  level: number;
  correct: boolean;
  score: number;
  adjustedPMastery: number;
  adjustedEloMu: number;
  mastered: boolean;
}

export interface CalibrationResult {
  modelClass: "CONSTRAINED" | "GUIDED" | "AUTONOMOUS";
  overallAccuracy: number;
  capabilityResults: CapabilityCalibrationResult[];
  skipTo: string | null; // First unmastered capability slug, or null if all mastered
  eloEstimate: number;
}

// ─── Calibration Constants ───────────────────────────────────

/**
 * Per-level pMastery boost on correct calibration response.
 *
 * Math check for L1 (pMastery = 0.85):
 *   One more correct → p(correct) = 0.85*0.9 + 0.15*0.05 = 0.7725
 *   p(L|correct) = 0.85*0.9/0.7725 = 0.9903
 *   p(L_new) = 0.9903 + 0.0097*0.2 = 0.9922 → mastered (>0.95)
 */
const CALIBRATION_BOOST: Record<number, number> = {
  0: 0.99, // L0: trivially easy → mark mastered instantly
  1: 0.85, // L1: one more correct = mastered
  2: 0.75, // L2: two more correct = mastered
};

/** Elo adjustment per correct calibration response. */
const ELO_BOOST_PER_LEVEL: Record<number, number> = {
  0: 25,  // Small boost for L0
  1: 50,  // Moderate boost for L1
  2: 75,  // Larger boost for L2
};

/** Calibration difficulty level — moderate, discriminating. */
const CALIBRATION_DIFFICULTY = 3;

// ─── Generate Calibration Battery ────────────────────────────

/**
 * Generate one calibration task per capability in the course.
 *
 * Uses random template selection (not Elo-based) to ensure broad coverage.
 * All tasks at moderate difficulty (3) for consistent discrimination.
 */
export async function generateCalibrationBattery(
  courseId: string
): Promise<CalibrationTask[]> {
  const capabilities = await db.capability.findMany({
    where: { courseId },
    orderBy: { level: "asc" },
  });

  const tasks: CalibrationTask[] = [];

  for (const cap of capabilities) {
    const templates = await db.taskTemplate.findMany({
      where: { capabilityId: cap.id },
    });

    if (templates.length === 0) continue;

    // For calibration, prefer non-adversarial templates (standard tests).
    // Adversarial templates have slugs containing "misleading", "distractor", "schema_reading".
    const standardTemplates = templates.filter(
      (t) =>
        !t.slug.includes("misleading") &&
        !t.slug.includes("distractor") &&
        !t.slug.includes("schema_reading")
    );

    // Fall back to all templates if no standard ones exist
    const pool = standardTemplates.length > 0 ? standardTemplates : templates;
    const template = pool[Math.floor(Math.random() * pool.length)];

    const templateInput: TaskTemplateInput = {
      slug: template.slug,
      promptTemplate: template.promptTemplate,
      parameterSchema: template.parameterSchema as any,
      difficultyRange: template.difficultyRange as any,
      rubricTemplate: (template.rubricTemplate as any) ?? {
        criteria: [],
        passThreshold: 0.7,
      },
      goldSolution: template.goldSolution ?? undefined,
    };

    const generated = generateTask(templateInput, CALIBRATION_DIFFICULTY);

    // Persist as a real Task (reusable for future attempts)
    const task = await db.task.create({
      data: {
        templateId: template.id,
        capabilityId: cap.id,
        prompt: generated.prompt,
        difficulty: generated.difficulty,
        parameters: generated.parameters as any,
        rubric: generated.rubric as any,
        goldSolution: generated.goldSolution,
      },
    });

    tasks.push({
      taskId: task.id,
      capability: cap.slug,
      capabilityName: cap.name,
      level: cap.level,
      difficulty: generated.difficulty,
      prompt: generated.prompt,
    });
  }

  return tasks;
}

// ─── Evaluate Calibration ────────────────────────────────────

/**
 * Evaluate calibration responses and compute adjustments.
 *
 * For each capability:
 *   - Evaluate the response against the task rubric
 *   - Apply per-level BKT prior boost
 *   - Compute Elo adjustment
 *   - Determine if capability is instantly mastered
 *
 * Then detect model class and compute skip-to point.
 */
export async function evaluateCalibration(
  agentId: string,
  courseId: string,
  responses: CalibrationResponse[]
): Promise<CalibrationResult> {
  const capabilityResults: CapabilityCalibrationResult[] = [];

  for (const { taskId, response } of responses) {
    const task = await db.task.findUnique({
      where: { id: taskId },
      include: { capability: true },
    });

    if (!task) continue;

    // Evaluate against rubric
    const evalResult = evaluate(response, task.rubric as any);

    // Get current mastery state for storing attempt
    const masteryState = await db.agentMasteryState.findUnique({
      where: {
        agentId_capabilityId: {
          agentId,
          capabilityId: task.capabilityId,
        },
      },
    });

    // Store as a real TaskAttempt for history
    await db.taskAttempt.create({
      data: {
        agentId,
        taskId: task.id,
        response: response as any,
        score: evalResult.score,
        correct: evalResult.correct,
        pMasteryBefore: masteryState?.pMastery ?? 0.1,
        pMasteryAfter: masteryState?.pMastery ?? 0.1, // Updated by applyCalibration
        eloMuBefore: masteryState?.eloMu ?? 1500,
        eloMuAfter: masteryState?.eloMu ?? 1500, // Updated by applyCalibration
        criteriaScores: evalResult.criteriaScores,
        evaluationNotes: `[CALIBRATION] ${evalResult.notes}`,
      },
    });

    // Compute adjustments
    const level = task.capability.level;
    const boost = CALIBRATION_BOOST[level] ?? 0.5;
    const eloBoost = ELO_BOOST_PER_LEVEL[level] ?? 50;

    const adjustedPMastery = evalResult.correct ? boost : 0.1;
    const adjustedEloMu = evalResult.correct ? 1500 + eloBoost : 1500;
    const mastered = adjustedPMastery >= AGENT_MASTERY_THRESHOLD;

    capabilityResults.push({
      capabilitySlug: task.capability.slug,
      capabilityName: task.capability.name,
      level,
      correct: evalResult.correct,
      score: evalResult.score,
      adjustedPMastery,
      adjustedEloMu,
      mastered,
    });
  }

  // Overall accuracy
  const totalCorrect = capabilityResults.filter((r) => r.correct).length;
  const overallAccuracy =
    capabilityResults.length > 0
      ? totalCorrect / capabilityResults.length
      : 0;

  // Model class detection
  const modelClass = detectModelClass(overallAccuracy, capabilityResults);

  // Skip-to logic: if all L0+L1 calibrations are CORRECT, promote them
  // to mastered and skip to the first unmastered capability.
  //
  // Without this, correct L1 calibrations sit at pMastery=0.85 (needing
  // one more correct each), wasting 3 tasks on a capable agent.
  const l0l1AllCorrect = capabilityResults
    .filter((r) => r.level <= 1)
    .every((r) => r.correct);

  if (l0l1AllCorrect) {
    for (const result of capabilityResults) {
      if (result.level <= 1 && result.correct) {
        result.adjustedPMastery = 0.99;
        result.mastered = true;
        result.adjustedEloMu = 1500 + (ELO_BOOST_PER_LEVEL[result.level] ?? 50);
      }
    }
  }

  const firstUnmastered = capabilityResults.find((r) => !r.mastered);
  const skipTo = l0l1AllCorrect
    ? firstUnmastered?.capabilitySlug ?? null
    : null;

  // Overall Elo estimate: base 1500, shift by accuracy
  const eloEstimate = 1500 + (overallAccuracy - 0.5) * 200;

  return {
    modelClass,
    overallAccuracy,
    capabilityResults,
    skipTo,
    eloEstimate,
  };
}

// ─── Apply Calibration ───────────────────────────────────────

/**
 * Write calibration results to the database.
 *
 * Updates:
 *   - AgentMasteryState per capability (pMastery, pInit, eloMu, masteredAt)
 *   - Agent model class and overall Elo
 */
export async function applyCalibration(
  agentId: string,
  courseId: string,
  calibration: CalibrationResult
): Promise<void> {
  // Map capability slugs to IDs
  const capabilities = await db.capability.findMany({
    where: { courseId },
  });
  const capMap = new Map(capabilities.map((c) => [c.slug, c.id]));

  // Update each capability's mastery state
  for (const result of calibration.capabilityResults) {
    const capId = capMap.get(result.capabilitySlug);
    if (!capId) continue;

    await db.agentMasteryState.update({
      where: {
        agentId_capabilityId: {
          agentId,
          capabilityId: capId,
        },
      },
      data: {
        pMastery: result.adjustedPMastery,
        pInit: result.adjustedPMastery, // Adjust the prior too
        eloMu: result.adjustedEloMu,
        totalAttempts: { increment: 1 },
        correctCount: result.correct ? { increment: 1 } : undefined,
        ...(result.mastered ? { masteredAt: new Date() } : {}),
        lastAttemptAt: new Date(),
      },
    });
  }

  // Update agent-level model class and overall Elo
  await db.agent.update({
    where: { id: agentId },
    data: {
      modelClass: calibration.modelClass,
      eloMu: calibration.eloEstimate,
    },
  });
}

// ─── Model Class Detection ───────────────────────────────────

/**
 * Detect agent's model class from calibration performance.
 *
 * AUTONOMOUS: ≥80% accuracy AND L2 correct
 *   → minimal scaffolding, high-level instructions
 *
 * GUIDED: ≥50% accuracy OR ≥2 L1 capabilities correct
 *   → moderate scaffolding, structured prompts
 *
 * CONSTRAINED: everything else
 *   → heavy scaffolding, narrow tool sets, step-by-step
 */
function detectModelClass(
  accuracy: number,
  results: CapabilityCalibrationResult[]
): "CONSTRAINED" | "GUIDED" | "AUTONOMOUS" {
  const l2Correct = results.some((r) => r.level === 2 && r.correct);
  const l1CorrectCount = results.filter(
    (r) => r.level === 1 && r.correct
  ).length;

  if (accuracy >= 0.8 && l2Correct) return "AUTONOMOUS";
  if (accuracy >= 0.5 || l1CorrectCount >= 2) return "GUIDED";
  return "CONSTRAINED";
}
