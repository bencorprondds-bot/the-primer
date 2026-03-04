/**
 * Task routes — The core learning loop.
 *
 * GET /tasks/next — Adaptive task selection
 * POST /tasks/:id/submit — Evaluate response + update ratings
 *
 * Selection algorithm (Phase 2):
 * 1. Get enrolled courses and agent mastery states
 * 2. Filter to unmastered capabilities with satisfied prerequisites
 * 3. Use AGI-Elo to select the most informative task
 * 4. Prepend relevant error reflections from past attempts
 * 5. Return the task
 */

import { Hono } from "hono";
import { db } from "../lib/db.js";
import { authMiddleware } from "../middleware/auth.js";
import { evaluate } from "../lib/evaluate.js";
import { eloUpdate, selectMostInformativeTask } from "../lib/elo.js";
import { bktUpdate, type BKTParams } from "../lib/bkt-bridge.js";
import { storeReflection, getRelevantReflections, formatReflectionsAsContext } from "../lib/error-memory.js";
import { generateTask, type TaskTemplateInput } from "../lib/task-generator.js";
import { updateTrust, actionClassFromLevel } from "../lib/trust.js";
import { branchForCapability } from "./specialization.js";
import type { AppEnv } from "../types.js";

const MASTERY_THRESHOLD = 0.95;
const PASS_THRESHOLD = 0.7;

export const taskRoutes = new Hono<AppEnv>();

/**
 * GET /tasks/next — Get the next adaptive task
 *
 * Query params:
 *   courseSlug?: string — filter to specific course
 *   forceCapability?: string — override adaptive selection
 */
taskRoutes.get("/next", authMiddleware, async (c) => {
  const agent = c.get("agent") as any;
  const courseSlug = c.req.query("courseSlug");
  const forceCapability = c.req.query("forceCapability");

  // Get enrollments
  const enrollments = await db.enrollment.findMany({
    where: {
      agentId: agent.id,
      ...(courseSlug ? { course: { slug: courseSlug } } : {}),
    },
    include: { course: true },
  });

  if (enrollments.length === 0) {
    return c.json({ error: "Not enrolled in any courses. POST /courses/:slug/enroll first." }, 400);
  }

  const courseIds = enrollments.map((e) => e.courseId);

  // Get all capabilities for enrolled courses
  const capabilities = await db.capability.findMany({
    where: { courseId: { in: courseIds } },
    include: {
      prerequisites: {
        include: { prerequisite: true },
      },
    },
    orderBy: { level: "asc" },
  });

  // Get agent's mastery states
  const masteryStates = await db.agentMasteryState.findMany({
    where: { agentId: agent.id },
  });
  const masteryMap = new Map(masteryStates.map((ms) => [ms.capabilityId, ms]));

  // Filter to unmastered capabilities with satisfied prerequisites
  // Sprint 2F: specialization filtering — only serve specialization tasks
  // matching the agent's focusArea; skip specialization tasks if no focusArea set
  let targetCapability = null;

  if (forceCapability) {
    targetCapability = capabilities.find((cap) => cap.slug === forceCapability);
  } else {
    for (const cap of capabilities) {
      const mastery = masteryMap.get(cap.id);
      if (mastery?.masteredAt) continue; // Already mastered

      // Specialization branch filtering
      const branch = branchForCapability(cap.slug);
      if (branch !== null) {
        // This is a specialization capability — only serve if agent's focusArea matches
        if (agent.focusArea !== branch) continue;
      }

      // Check prerequisites
      const prereqsMet = cap.prerequisites.every((prereq) => {
        const prereqMastery = masteryMap.get(prereq.prerequisiteId);
        return prereqMastery?.masteredAt !== null && prereqMastery?.masteredAt !== undefined;
      });

      if (prereqsMet) {
        targetCapability = cap;
        break;
      }
    }
  }

  if (!targetCapability) {
    return c.json({
      message: "All available capabilities mastered! Course complete.",
      mastery: masteryStates.map((ms) => ({
        capabilityId: ms.capabilityId,
        pMastery: ms.pMastery,
        mastered: ms.masteredAt !== null,
      })),
    });
  }

  // Find available tasks for this capability
  const tasks = await db.task.findMany({
    where: { capabilityId: targetCapability.id },
  });

  // Also check for templates to generate new tasks
  const templates = await db.taskTemplate.findMany({
    where: { capabilityId: targetCapability.id },
  });

  let selectedTask;

  if (templates.length > 0) {
    // Phase 2: Generate a fresh task from template
    const agentMastery = masteryMap.get(targetCapability.id);
    const agentElo = { mu: agentMastery?.eloMu ?? 1500, sigma: agentMastery?.eloSigma ?? 350 };

    // Pick best template using Elo-based task selection
    const templateCandidates = templates.map((t) => ({
      id: t.id,
      rating: { mu: t.eloMu, sigma: t.eloSigma },
    }));

    const bestTemplateId = selectMostInformativeTask(agentElo, templateCandidates);
    const template = templates.find((t) => t.id === bestTemplateId) ?? templates[0];

    // Determine difficulty from agent's mastery/elo
    const difficulty = estimateDifficulty(agentElo.mu);

    // Generate task instance
    const templateInput: TaskTemplateInput = {
      slug: template.slug,
      promptTemplate: template.promptTemplate,
      parameterSchema: template.parameterSchema as any,
      difficultyRange: template.difficultyRange as any,
      rubricTemplate: (template.rubricTemplate as any) ?? { criteria: [], passThreshold: 0.7 },
      goldSolution: template.goldSolution ?? undefined,
    };

    const generated = generateTask(templateInput, difficulty);

    // Persist the generated task instance
    selectedTask = await db.task.create({
      data: {
        templateId: template.id,
        capabilityId: targetCapability.id,
        prompt: generated.prompt,
        difficulty: generated.difficulty,
        parameters: generated.parameters as any,
        rubric: generated.rubric as any,
        goldSolution: generated.goldSolution,
      },
    });
  } else if (tasks.length > 0) {
    // Sprint 1 fallback: select from existing static tasks
    // Prefer tasks not recently attempted by this agent
    const recentAttemptIds = await db.taskAttempt.findMany({
      where: { agentId: agent.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { taskId: true },
    });
    const recentIds = new Set(recentAttemptIds.map((a) => a.taskId));

    // Use Elo-based selection if available, otherwise simple difficulty ordering
    const agentMastery = masteryMap.get(targetCapability.id);
    const agentElo = { mu: agentMastery?.eloMu ?? 1500, sigma: agentMastery?.eloSigma ?? 350 };

    const candidates = tasks
      .filter((t) => !recentIds.has(t.id))
      .map((t) => ({
        id: t.id,
        rating: { mu: t.eloMu, sigma: t.eloSigma },
      }));

    if (candidates.length > 0) {
      const bestId = selectMostInformativeTask(agentElo, candidates);
      selectedTask = tasks.find((t) => t.id === bestId) ?? tasks[0];
    } else {
      // All tasks recently attempted — pick the least recent
      selectedTask = tasks[0];
    }
  } else {
    return c.json({ error: "No tasks available for this capability. Templates need to be seeded." }, 500);
  }

  // Get relevant reflections for context
  const reflections = await getRelevantReflections(agent.id, targetCapability.slug);
  const reflectionContext = formatReflectionsAsContext(reflections);

  // Build the task prompt (with reflections prepended if any)
  const fullPrompt = reflectionContext
    ? `${reflectionContext}\n${selectedTask.prompt}`
    : selectedTask.prompt;

  return c.json({
    taskId: selectedTask.id,
    capability: targetCapability.slug,
    capabilityName: targetCapability.name,
    level: targetCapability.level,
    difficulty: selectedTask.difficulty,
    prompt: fullPrompt,
    hasReflections: reflections.length > 0,
    // Don't expose the rubric — agents shouldn't see evaluation criteria
  });
});

/**
 * POST /tasks/:id/submit — Submit a response for evaluation
 *
 * Body: {
 *   response: { toolCalls?: [...], text?: string, ... },
 *   reflection?: string,  // Optional self-reflection on failure
 *   tokenCount?: number,
 *   toolCallCount?: number,
 * }
 */
taskRoutes.post("/:id/submit", authMiddleware, async (c) => {
  const agent = c.get("agent") as any;
  const taskId = c.req.param("id");
  const body = await c.req.json();
  const { response, reflection, tokenCount, toolCallCount } = body;

  if (!response) {
    return c.json({ error: "response is required" }, 400);
  }

  // Load task
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: { capability: true },
  });

  if (!task) {
    return c.json({ error: "Task not found" }, 404);
  }

  // Evaluate response against rubric
  const evalResult = evaluate(response, task.rubric as any);

  // Get current mastery state
  let masteryState = await db.agentMasteryState.findUnique({
    where: {
      agentId_capabilityId: {
        agentId: agent.id,
        capabilityId: task.capabilityId,
      },
    },
  });

  if (!masteryState) {
    // Auto-create if missing
    masteryState = await db.agentMasteryState.create({
      data: {
        agentId: agent.id,
        capabilityId: task.capabilityId,
        pMastery: 0.1,
        pInit: 0.1,
        pTransit: 0.2,
        pSlip: 0.1,
        pGuess: 0.05,
      },
    });
  }

  // ── BKT Update ──
  const bktParams: BKTParams = {
    pMastery: masteryState.pMastery,
    pInit: masteryState.pInit,
    pTransit: masteryState.pTransit,
    pSlip: masteryState.pSlip,
    pGuess: masteryState.pGuess,
  };

  const bktResult = bktUpdate(bktParams, evalResult.correct);

  // ── AGI-Elo Update ──
  const agentElo = { mu: masteryState.eloMu, sigma: masteryState.eloSigma };
  const taskElo = { mu: task.eloMu, sigma: task.eloSigma };
  const eloResult = eloUpdate(agentElo, taskElo, evalResult.score);

  // ── Persist Everything ──

  // 1. Task attempt
  const attempt = await db.taskAttempt.create({
    data: {
      agentId: agent.id,
      taskId: task.id,
      response,
      score: evalResult.score,
      correct: evalResult.correct,
      pMasteryBefore: masteryState.pMastery,
      pMasteryAfter: bktResult.pMastery,
      eloMuBefore: masteryState.eloMu,
      eloMuAfter: eloResult.agent.mu,
      criteriaScores: evalResult.criteriaScores,
      evaluationNotes: evalResult.notes,
      tokenCount,
      toolCallCount,
    },
  });

  // 2. Update mastery state
  await db.agentMasteryState.update({
    where: {
      agentId_capabilityId: {
        agentId: agent.id,
        capabilityId: task.capabilityId,
      },
    },
    data: {
      pMastery: bktResult.pMastery,
      eloMu: eloResult.agent.mu,
      eloSigma: eloResult.agent.sigma,
      totalAttempts: { increment: 1 },
      correctCount: evalResult.correct ? { increment: 1 } : undefined,
      masteredAt: bktResult.isMastered && !bktResult.wasMastered ? new Date() : undefined,
      lastAttemptAt: new Date(),
    },
  });

  // 3. Update task Elo
  await db.task.update({
    where: { id: task.id },
    data: {
      eloMu: eloResult.task.mu,
      eloSigma: eloResult.task.sigma,
    },
  });

  // 4. Update agent-level Elo (aggregate)
  await db.agent.update({
    where: { id: agent.id },
    data: {
      eloMu: eloResult.agent.mu, // Simplified: uses last capability Elo
      eloSigma: eloResult.agent.sigma,
    },
  });

  // 5. Store reflection if provided (or auto-generate on failure)
  if (!evalResult.correct && reflection) {
    await storeReflection({
      agentId: agent.id,
      taskAttemptId: attempt.id,
      capabilitySlug: task.capability.slug,
      content: reflection,
      errorType: inferErrorType(evalResult),
    });
  }

  // 6. Update trust state (per-action-class graduated autonomy)
  const actionClass = actionClassFromLevel(task.capability.level);
  const trustResult = await updateTrust(agent.id, actionClass, evalResult.correct);

  return c.json({
    attemptId: attempt.id,
    score: evalResult.score,
    correct: evalResult.correct,
    criteriaScores: evalResult.criteriaScores,
    notes: evalResult.notes,
    mastery: {
      before: masteryState.pMastery,
      after: bktResult.pMastery,
      isMastered: bktResult.isMastered,
      justMastered: bktResult.isMastered && !bktResult.wasMastered,
    },
    elo: {
      before: masteryState.eloMu,
      after: eloResult.agent.mu,
      expected: eloResult.expectedScore,
    },
    trust: {
      actionClass,
      trustLevel: trustResult.trustLevel,
      totalActions: trustResult.totalActions,
      accuracy: Math.round(trustResult.accuracy * 1000) / 1000,
    },
    // Prompt for reflection if the agent didn't provide one
    ...((!evalResult.correct && !reflection) ? {
      requestReflection: true,
      reflectionPrompt: "What went wrong? Write a brief lesson (100-200 tokens) about what you'd do differently.",
    } : {}),
  });
});

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Estimate target difficulty from agent Elo rating.
 * Higher Elo → harder tasks.
 */
function estimateDifficulty(agentMu: number): number {
  if (agentMu < 1300) return 1;
  if (agentMu < 1450) return 2;
  if (agentMu < 1550) return 3;
  if (agentMu < 1700) return 4;
  return 5;
}

/**
 * Infer error type from evaluation result.
 */
function inferErrorType(
  evalResult: { criteriaScores: Record<string, number> }
): "TOOL_SELECTION" | "ARGUMENT_ERROR" | "INTERPRETATION" | "PLANNING" | "COLLABORATION" | "UNKNOWN" {
  const scores = evalResult.criteriaScores;
  for (const [key, score] of Object.entries(scores)) {
    if (score < 1.0) {
      if (key.startsWith("tool_selected")) return "TOOL_SELECTION";
      if (key.startsWith("argument_valid")) return "ARGUMENT_ERROR";
      if (key.startsWith("plan_quality")) return "PLANNING";
      if (key.startsWith("collaboration_quality")) return "COLLABORATION";
      if (key.startsWith("result_correct")) return "INTERPRETATION";
    }
  }
  return "UNKNOWN";
}
