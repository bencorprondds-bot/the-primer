import { Hono } from "hono";
import { db } from "../lib/db.js";
import { authMiddleware } from "../middleware/auth.js";
import type { AppEnv } from "../types.js";

export const courseRoutes = new Hono<AppEnv>();

/**
 * GET /courses — List available courses
 * Public endpoint (no auth required)
 */
courseRoutes.get("/", async (c) => {
  const courses = await db.course.findMany({
    where: { published: true },
    include: {
      capabilities: {
        select: { slug: true, name: true, level: true },
        orderBy: { level: "asc" },
      },
      modules: {
        select: { id: true, title: true, orderIndex: true },
        orderBy: { orderIndex: "asc" },
      },
    },
  });

  return c.json(
    courses.map((course) => ({
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      capabilities: course.capabilities,
      moduleCount: course.modules.length,
    }))
  );
});

/**
 * GET /courses/:slug — Get course detail
 */
courseRoutes.get("/:slug", async (c) => {
  const slug = c.req.param("slug");

  const course = await db.course.findUnique({
    where: { slug },
    include: {
      capabilities: {
        include: {
          prerequisites: {
            include: { prerequisite: { select: { slug: true, name: true } } },
          },
        },
        orderBy: { level: "asc" },
      },
      modules: {
        include: {
          tasks: {
            select: { id: true, difficulty: true, capabilityId: true },
          },
        },
        orderBy: { orderIndex: "asc" },
      },
    },
  });

  if (!course) {
    return c.json({ error: "Course not found" }, 404);
  }

  return c.json({
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.description,
    capabilities: course.capabilities.map((cap) => ({
      slug: cap.slug,
      name: cap.name,
      description: cap.description,
      level: cap.level,
      prerequisites: cap.prerequisites.map((p) => p.prerequisite.slug),
    })),
    modules: course.modules.map((mod) => ({
      id: mod.id,
      title: mod.title,
      taskCount: mod.tasks.length,
    })),
  });
});

/**
 * POST /courses/:slug/enroll — Enroll in a course
 * Requires: Authorization: Bearer <api-key>
 */
courseRoutes.post("/:slug/enroll", authMiddleware, async (c) => {
  const agent = c.get("agent") as any;
  const slug = c.req.param("slug");

  const course = await db.course.findUnique({
    where: { slug },
    include: { capabilities: true },
  });

  if (!course) {
    return c.json({ error: "Course not found" }, 404);
  }

  // Check if already enrolled
  const existing = await db.enrollment.findUnique({
    where: {
      agentId_courseId: {
        agentId: agent.id,
        courseId: course.id,
      },
    },
  });

  if (existing) {
    return c.json({ message: "Already enrolled", enrollmentId: existing.id });
  }

  // Create enrollment
  const enrollment = await db.enrollment.create({
    data: {
      agentId: agent.id,
      courseId: course.id,
    },
  });

  // Initialize mastery states for all capabilities
  await db.agentMasteryState.createMany({
    data: course.capabilities.map((cap) => ({
      agentId: agent.id,
      capabilityId: cap.id,
      pMastery: 0.1,
      pInit: 0.1,
      pTransit: 0.2,
      pSlip: 0.1,
      pGuess: 0.05, // Lower for agents
    })),
    skipDuplicates: true,
  });

  return c.json({
    enrollmentId: enrollment.id,
    courseId: course.id,
    courseTitle: course.title,
    capabilities: course.capabilities.length,
    message: "Enrolled successfully. Use GET /tasks/next to start.",
  }, 201);
});
