/**
 * Assessment routes — Baseline calibration and adaptive difficulty.
 *
 * Sprint 2C: Smart onboarding that adapts to agent capability.
 *
 * Flow:
 *   1. Agent registers + enrolls (existing routes)
 *   2. POST /assess/baseline → get calibration tasks (5, one per capability)
 *   3. POST /assess/baseline/submit → submit all responses, get calibration
 *   4. GET /tasks/next → start learning with adjusted priors + skip logic
 *
 * The baseline assessment is optional but recommended. Without it,
 * agents start at pMastery=0.1 for everything and grind through
 * trivial levels. With it, capable agents skip to their actual level.
 */

import { Hono } from "hono";
import { db } from "../lib/db.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  generateCalibrationBattery,
  evaluateCalibration,
  applyCalibration,
  type CalibrationResponse,
} from "../lib/calibration.js";
import type { AppEnv } from "../types.js";

export const assessRoutes = new Hono<AppEnv>();

/**
 * POST /assess/baseline — Start baseline assessment
 *
 * Generates one calibration task per capability at moderate difficulty (3).
 * Returns all tasks for the agent to attempt simultaneously.
 *
 * Body: { courseSlug: string }
 *
 * Returns: {
 *   assessmentType: "baseline",
 *   courseSlug: string,
 *   taskCount: number,
 *   instructions: string,
 *   tasks: CalibrationTask[]
 * }
 */
assessRoutes.post("/baseline", authMiddleware, async (c) => {
  const agent = c.get("agent") as any;
  const body = await c.req.json();
  const { courseSlug } = body;

  if (!courseSlug) {
    return c.json({ error: "courseSlug is required" }, 400);
  }

  // Verify enrollment
  const enrollment = await db.enrollment.findFirst({
    where: {
      agentId: agent.id,
      course: { slug: courseSlug },
    },
    include: { course: true },
  });

  if (!enrollment) {
    return c.json(
      {
        error:
          "Not enrolled in this course. POST /courses/:slug/enroll first.",
      },
      400
    );
  }

  // Check if already calibrated
  if (agent.modelClass !== "UNKNOWN") {
    return c.json({
      message: "Already calibrated",
      modelClass: agent.modelClass,
      hint: "Use GET /tasks/next to continue learning. To recalibrate, contact an administrator.",
    });
  }

  // Generate calibration battery
  const tasks = await generateCalibrationBattery(enrollment.courseId);

  if (tasks.length === 0) {
    return c.json(
      {
        error:
          "No templates available for calibration. Ensure course content is seeded.",
      },
      500
    );
  }

  return c.json({
    assessmentType: "baseline",
    courseSlug,
    taskCount: tasks.length,
    instructions:
      "Attempt each task below. Submit all responses together to POST /assess/baseline/submit",
    tasks,
  });
});

/**
 * POST /assess/baseline/submit — Submit calibration responses
 *
 * Evaluates all responses against their task rubrics, computes
 * per-capability adjustments, detects model class, and applies
 * BKT prior and Elo adjustments.
 *
 * Body: {
 *   courseSlug: string,
 *   responses: [{ taskId: string, response: { toolCalls?, text? } }]
 * }
 *
 * Returns: {
 *   calibration: { modelClass, overallAccuracy, eloEstimate, skipTo },
 *   capabilities: [...per-capability results...],
 *   nextStep: string
 * }
 */
assessRoutes.post("/baseline/submit", authMiddleware, async (c) => {
  const agent = c.get("agent") as any;
  const body = await c.req.json();
  const { courseSlug, responses } = body;

  if (!courseSlug || !responses?.length) {
    return c.json(
      { error: "courseSlug and responses[] are required" },
      400
    );
  }

  // Verify enrollment
  const enrollment = await db.enrollment.findFirst({
    where: {
      agentId: agent.id,
      course: { slug: courseSlug },
    },
    include: { course: true },
  });

  if (!enrollment) {
    return c.json({ error: "Not enrolled in this course" }, 400);
  }

  // Prevent double calibration
  if (agent.modelClass !== "UNKNOWN") {
    return c.json({
      message: "Already calibrated",
      modelClass: agent.modelClass,
      hint: "Use GET /tasks/next to continue learning.",
    });
  }

  // Evaluate all calibration responses
  const calibration = await evaluateCalibration(
    agent.id,
    enrollment.courseId,
    responses as CalibrationResponse[]
  );

  // Apply calibration to database
  await applyCalibration(agent.id, enrollment.courseId, calibration);

  // Format response
  const masteredCount = calibration.capabilityResults.filter(
    (r) => r.mastered
  ).length;
  const totalCaps = calibration.capabilityResults.length;

  let nextStep: string;
  if (calibration.skipTo) {
    nextStep = `${masteredCount}/${totalCaps} capabilities mastered via calibration. Start at: ${calibration.skipTo} (GET /tasks/next)`;
  } else if (masteredCount === totalCaps) {
    nextStep = "All capabilities mastered! Course complete.";
  } else {
    nextStep = "Start learning: GET /tasks/next";
  }

  return c.json({
    calibration: {
      modelClass: calibration.modelClass,
      overallAccuracy: Math.round(calibration.overallAccuracy * 100) / 100,
      eloEstimate: Math.round(calibration.eloEstimate),
      skipTo: calibration.skipTo,
    },
    capabilities: calibration.capabilityResults.map((r) => ({
      capability: r.capabilitySlug,
      name: r.capabilityName,
      level: r.level,
      correct: r.correct,
      score: Math.round(r.score * 100) / 100,
      mastered: r.mastered,
      adjustedPMastery:
        Math.round(r.adjustedPMastery * 1000) / 1000,
    })),
    nextStep,
  });
});

/**
 * GET /assess/status — Get current calibration status and mastery overview
 *
 * Returns the agent's model class, per-capability mastery, and
 * recommendations for what to work on next.
 */
assessRoutes.get("/status", authMiddleware, async (c) => {
  const agent = c.get("agent") as any;

  const masteryStates = await db.agentMasteryState.findMany({
    where: { agentId: agent.id },
    include: {
      capability: {
        include: {
          prerequisites: {
            include: {
              prerequisite: { select: { slug: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: { capability: { level: "asc" } },
  });

  const calibrated = agent.modelClass !== "UNKNOWN";

  // Compute what's available (prerequisites met, not mastered)
  const masteryMap = new Map(
    masteryStates.map((ms: any) => [ms.capabilityId, ms])
  );

  const available: string[] = [];
  const mastered: string[] = [];
  const locked: string[] = [];

  for (const ms of masteryStates) {
    if (ms.masteredAt) {
      mastered.push(ms.capability.slug);
      continue;
    }

    const prereqsMet = ms.capability.prerequisites.every(
      (prereq: any) => {
        const prereqState = masteryMap.get(prereq.prerequisiteId);
        return prereqState?.masteredAt != null;
      }
    );

    if (prereqsMet) {
      available.push(ms.capability.slug);
    } else {
      locked.push(ms.capability.slug);
    }
  }

  return c.json({
    calibrated,
    modelClass: agent.modelClass,
    elo: { mu: Math.round(agent.eloMu), sigma: Math.round(agent.eloSigma) },
    capabilities: masteryStates.map((ms: any) => ({
      capability: ms.capability.slug,
      name: ms.capability.name,
      level: ms.capability.level,
      pMastery: Math.round(ms.pMastery * 1000) / 1000,
      elo: { mu: Math.round(ms.eloMu), sigma: Math.round(ms.eloSigma) },
      mastered: ms.masteredAt !== null,
      attempts: ms.totalAttempts,
      accuracy:
        ms.totalAttempts > 0
          ? Math.round((ms.correctCount / ms.totalAttempts) * 100)
          : null,
    })),
    summary: {
      mastered,
      available,
      locked,
    },
    ...(calibrated
      ? {}
      : {
          recommendation:
            "Run POST /assess/baseline to calibrate starting difficulty.",
        }),
  });
});
