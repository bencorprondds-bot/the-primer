/**
 * Specialization routes — Branch enrollment and skill tree visualization.
 *
 * POST /specialization/enroll — Declare a specialization focus area
 * GET  /specialization/skill-tree — Full DAG with mastery states
 *
 * Sprint 2F: Specialization stubs for Research and Web Dev branches.
 * Agents must complete Foundation meta-skills (L5) before specializing.
 */

import { Hono } from "hono";
import { db } from "../lib/db.js";
import { authMiddleware } from "../middleware/auth.js";
import type { AppEnv } from "../types.js";

const VALID_SPECIALIZATIONS = ["research", "web-dev"] as const;
type Specialization = (typeof VALID_SPECIALIZATIONS)[number];

/**
 * Map specialization to capability slug prefix.
 * research → research_*
 * web-dev → webdev_*
 */
function slugPrefixForSpecialization(spec: Specialization): string {
  switch (spec) {
    case "research": return "research_";
    case "web-dev": return "webdev_";
  }
}

/**
 * Determine which specialization branch a capability belongs to,
 * based on its slug prefix. Returns null for Foundation capabilities.
 */
export function branchForCapability(slug: string): string | null {
  if (slug.startsWith("research_")) return "research";
  if (slug.startsWith("webdev_")) return "web-dev";
  return null;
}

const FOUNDATION_MAX_LEVEL = 5;

export const specializationRoutes = new Hono<AppEnv>();

/**
 * POST /specialization/enroll — Declare a specialization
 *
 * Body: { specialization: "research" | "web-dev" }
 *
 * Prerequisites: All L5 (Meta-Skills) capabilities must be mastered.
 */
specializationRoutes.post("/enroll", authMiddleware, async (c) => {
  const agent = c.get("agent") as any;
  const body = await c.req.json();
  const { specialization } = body;

  if (!specialization || !VALID_SPECIALIZATIONS.includes(specialization)) {
    return c.json({
      error: `Invalid specialization. Choose one of: ${VALID_SPECIALIZATIONS.join(", ")}`,
      available: VALID_SPECIALIZATIONS,
    }, 400);
  }

  // Check if already specialized
  if (agent.focusArea === specialization) {
    return c.json({ message: `Already specialized in ${specialization}`, focusArea: agent.focusArea });
  }

  // Gate: check that all L5 capabilities are mastered
  const l5Capabilities = await db.capability.findMany({
    where: { level: FOUNDATION_MAX_LEVEL },
  });

  const masteryStates = await db.agentMasteryState.findMany({
    where: {
      agentId: agent.id,
      capabilityId: { in: l5Capabilities.map((c) => c.id) },
    },
  });

  const unmasteredL5 = l5Capabilities.filter((cap) => {
    const ms = masteryStates.find((m) => m.capabilityId === cap.id);
    return !ms?.masteredAt;
  });

  if (unmasteredL5.length > 0) {
    return c.json({
      error: "Must master all Foundation Meta-Skills (L5) before specializing.",
      unmastered: unmasteredL5.map((c) => ({ slug: c.slug, name: c.name })),
      progress: `${l5Capabilities.length - unmasteredL5.length}/${l5Capabilities.length} L5 capabilities mastered`,
    }, 403);
  }

  // Set focus area
  await db.agent.update({
    where: { id: agent.id },
    data: { focusArea: specialization },
  });

  // Initialize mastery states for specialization capabilities
  const prefix = slugPrefixForSpecialization(specialization as Specialization);
  const specCapabilities = await db.capability.findMany({
    where: { slug: { startsWith: prefix } },
  });

  if (specCapabilities.length > 0) {
    await db.agentMasteryState.createMany({
      data: specCapabilities.map((cap) => ({
        agentId: agent.id,
        capabilityId: cap.id,
        pMastery: 0.1,
        pInit: 0.1,
        pTransit: 0.2,
        pSlip: 0.1,
        pGuess: 0.05,
      })),
      skipDuplicates: true,
    });
  }

  return c.json({
    message: `Specialized in ${specialization}`,
    focusArea: specialization,
    newCapabilities: specCapabilities.map((c) => ({
      slug: c.slug,
      name: c.name,
      level: c.level,
    })),
    hint: "Use GET /tasks/next to start working on specialization tasks.",
  }, 200);
});

/**
 * GET /specialization/skill-tree — Full capability DAG with mastery states
 *
 * Returns the complete skill tree organized by Foundation levels
 * and specialization branches, with per-capability mastery data.
 */
specializationRoutes.get("/skill-tree", authMiddleware, async (c) => {
  const agent = c.get("agent") as any;

  // Get all capabilities with prerequisites
  const capabilities = await db.capability.findMany({
    include: {
      prerequisites: {
        include: { prerequisite: { select: { slug: true, name: true } } },
      },
      dependents: {
        include: { dependent: { select: { slug: true, name: true } } },
      },
    },
    orderBy: [{ level: "asc" }, { slug: "asc" }],
  });

  // Get agent's mastery states
  const masteryStates = await db.agentMasteryState.findMany({
    where: { agentId: agent.id },
  });
  const masteryMap = new Map(masteryStates.map((ms) => [ms.capabilityId, ms]));

  // Build structured tree
  const foundationLevels: Record<number, Array<{
    slug: string;
    name: string;
    description: string;
    level: number;
    prerequisites: string[];
    unlocks: string[];
    mastery: {
      pMastery: number;
      mastered: boolean;
      totalAttempts: number;
      correctCount: number;
    } | null;
    status: "locked" | "available" | "in_progress" | "mastered";
  }>> = {};

  const specializations: Record<string, {
    name: string;
    capabilities: typeof foundationLevels[number];
  }> = {
    research: { name: "Research", capabilities: [] },
    "web-dev": { name: "Web Development", capabilities: [] },
  };

  for (const cap of capabilities) {
    const ms = masteryMap.get(cap.id);

    // Check if prerequisites are met
    const prereqsMet = cap.prerequisites.every((prereq) => {
      const prereqMs = masteryMap.get(prereq.prerequisiteId);
      return prereqMs?.masteredAt != null;
    });

    let status: "locked" | "available" | "in_progress" | "mastered";
    if (ms?.masteredAt) {
      status = "mastered";
    } else if (prereqsMet && ms && ms.totalAttempts > 0) {
      status = "in_progress";
    } else if (prereqsMet) {
      status = "available";
    } else {
      status = "locked";
    }

    const capNode = {
      slug: cap.slug,
      name: cap.name,
      description: cap.description,
      level: cap.level,
      prerequisites: cap.prerequisites.map((p) => p.prerequisite.slug),
      unlocks: cap.dependents.map((d) => d.dependent.slug),
      mastery: ms ? {
        pMastery: ms.pMastery,
        mastered: ms.masteredAt != null,
        totalAttempts: ms.totalAttempts,
        correctCount: ms.correctCount,
      } : null,
      status,
    };

    const branch = branchForCapability(cap.slug);
    if (branch && specializations[branch]) {
      specializations[branch].capabilities.push(capNode);
    } else {
      if (!foundationLevels[cap.level]) {
        foundationLevels[cap.level] = [];
      }
      foundationLevels[cap.level].push(capNode);
    }
  }

  // Level names
  const levelNames: Record<number, string> = {
    0: "Orientation",
    1: "Single Tool Mastery",
    2: "Composition",
    3: "Planning",
    4: "Human Collaboration",
    5: "Meta-Skills",
  };

  const foundation = Object.entries(foundationLevels)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([level, caps]) => ({
      level: Number(level),
      name: levelNames[Number(level)] || `Level ${level}`,
      capabilities: caps,
      progress: {
        mastered: caps.filter((c) => c.status === "mastered").length,
        total: caps.length,
      },
    }));

  // Summary stats
  const allCaps = capabilities.length;
  const masteredCount = masteryStates.filter((ms) => ms.masteredAt != null).length;
  const foundationCaps = capabilities.filter((c) => branchForCapability(c.slug) === null).length;
  const foundationMastered = capabilities
    .filter((c) => branchForCapability(c.slug) === null)
    .filter((c) => masteryMap.get(c.id)?.masteredAt != null).length;

  return c.json({
    foundation,
    specializations: Object.entries(specializations).map(([key, val]) => ({
      branch: key,
      name: val.name,
      unlocked: agent.focusArea === key,
      capabilities: val.capabilities,
      progress: {
        mastered: val.capabilities.filter((c) => c.status === "mastered").length,
        total: val.capabilities.length,
      },
    })),
    agent: {
      id: agent.id,
      name: agent.name,
      focusArea: agent.focusArea,
      elo: { mu: agent.eloMu, sigma: agent.eloSigma },
    },
    summary: {
      totalCapabilities: allCaps,
      totalMastered: masteredCount,
      foundationProgress: `${foundationMastered}/${foundationCaps}`,
      foundationComplete: foundationMastered === foundationCaps,
    },
  });
});
