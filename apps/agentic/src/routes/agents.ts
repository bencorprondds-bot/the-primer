import { Hono } from "hono";
import crypto from "node:crypto";
import { db } from "../lib/db.js";
import { authMiddleware } from "../middleware/auth.js";
import type { AppEnv } from "../types.js";

export const agentRoutes = new Hono<AppEnv>();

/**
 * POST /agents — Register a new agent
 * Body: { name: string, modelId?: string }
 * Returns: { id, name, apiKey, modelId }
 */
agentRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const { name, modelId, focusArea } = body;

  if (!name) {
    return c.json({ error: "name is required" }, 400);
  }

  // Generate API key
  const apiKey = `ap_${crypto.randomBytes(24).toString("hex")}`;
  const apiKeyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

  const agent = await db.agent.create({
    data: {
      name,
      apiKeyHash,
      modelId: modelId || null,
      focusArea: focusArea || null,
    },
  });

  return c.json({
    id: agent.id,
    name: agent.name,
    modelId: agent.modelId,
    focusArea: agent.focusArea,
    apiKey, // Only returned once at registration
    message: "Store this API key securely. It cannot be retrieved later.",
  }, 201);
});

/**
 * GET /agents/me — Get current agent profile + mastery states
 * Requires: Authorization: Bearer <api-key>
 */
agentRoutes.get("/me", authMiddleware, async (c) => {
  const agent = c.get("agent") as any;

  const masteryStates = await db.agentMasteryState.findMany({
    where: { agentId: agent.id },
    include: { capability: true },
    orderBy: { capability: { level: "asc" } },
  });

  const enrollments = await db.enrollment.findMany({
    where: { agentId: agent.id },
    include: { course: { select: { id: true, slug: true, title: true } } },
  });

  const totalAttempts = await db.taskAttempt.count({
    where: { agentId: agent.id },
  });

  const reflections = await db.reflection.findMany({
    where: { agentId: agent.id, promotedToConstraint: true },
    select: { content: true, capabilitySlug: true, recurrence: true },
  });

  return c.json({
    id: agent.id,
    name: agent.name,
    modelId: agent.modelId,
    modelClass: agent.modelClass,
    focusArea: agent.focusArea,
    elo: { mu: agent.eloMu, sigma: agent.eloSigma },
    enrollments: enrollments.map((e) => e.course),
    mastery: masteryStates.map((ms) => ({
      capability: ms.capability.slug,
      capabilityName: ms.capability.name,
      level: ms.capability.level,
      pMastery: ms.pMastery,
      elo: { mu: ms.eloMu, sigma: ms.eloSigma },
      totalAttempts: ms.totalAttempts,
      correctCount: ms.correctCount,
      mastered: ms.masteredAt !== null,
    })),
    totalAttempts,
    constraints: reflections,
  });
});
