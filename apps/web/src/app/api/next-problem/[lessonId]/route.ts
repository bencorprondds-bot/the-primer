import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { MASTERY_THRESHOLD } from "@primer/shared";
import { ensureUser } from "@/lib/ensure-user";

/**
 * GET /api/next-problem/[lessonId]
 *
 * Adaptive problem selection for a lesson. Algorithm:
 * 1. Get all KCs for problems in this lesson
 * 2. Get student's mastery state for those KCs
 * 3. Filter to unmastered KCs whose prerequisites are met
 * 4. Sort by lowest mastery first
 * 5. Pick a problem targeting the weakest KC that hasn't been recently attempted
 * 6. If all KCs mastered, signal lesson complete
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;

  const user = await ensureUser(clerkId);

  // Get all problems in this lesson with their KC links
  const problems = await db.problem.findMany({
    where: { lessonId },
    include: {
      kcs: { select: { kcId: true } },
    },
    orderBy: { orderIndex: "asc" },
  });

  if (problems.length === 0) {
    return NextResponse.json({ error: "Lesson not found or has no problems" }, { status: 404 });
  }

  // Collect all KC IDs from problems in this lesson
  const lessonKcIds = [...new Set(problems.flatMap((p) => p.kcs.map((k) => k.kcId)))];

  // Get student's mastery states for these KCs
  const masteryStates = await db.studentMasteryState.findMany({
    where: {
      studentId: user.id,
      kcId: { in: lessonKcIds },
    },
  });
  const masteryMap = new Map(masteryStates.map((ms) => [ms.kcId, ms]));

  // Get KC prerequisites
  const prerequisites = await db.kCPrerequisite.findMany({
    where: { dependentId: { in: lessonKcIds } },
  });
  const prereqMap = new Map<string, string[]>();
  for (const p of prerequisites) {
    const deps = prereqMap.get(p.dependentId) ?? [];
    deps.push(p.prerequisiteId);
    prereqMap.set(p.dependentId, deps);
  }

  // Check which KCs are "ready" (unmastered + prerequisites met)
  const kcReadiness: Array<{ kcId: string; pMastery: number; ready: boolean }> = [];

  for (const kcId of lessonKcIds) {
    const mastery = masteryMap.get(kcId);
    const pMastery = mastery?.pMastery ?? 0.1; // Default for unseen KCs
    const isMastered = pMastery >= MASTERY_THRESHOLD;

    if (isMastered) continue; // Skip mastered KCs

    // Check prerequisites
    const prereqs = prereqMap.get(kcId) ?? [];
    const prereqsMet = prereqs.every((prereqId) => {
      const prereqMastery = masteryMap.get(prereqId);
      return prereqMastery && prereqMastery.pMastery >= MASTERY_THRESHOLD;
    });

    kcReadiness.push({ kcId, pMastery, ready: prereqsMet });
  }

  // If all KCs mastered, lesson is complete
  if (kcReadiness.length === 0) {
    return NextResponse.json({
      lessonComplete: true,
      message: "All knowledge components mastered for this lesson",
      mastery: lessonKcIds.map((kcId) => ({
        kcId,
        pMastery: masteryMap.get(kcId)?.pMastery ?? 0.1,
      })),
    });
  }

  // Sort ready KCs by lowest mastery first
  const readyKCs = kcReadiness
    .filter((k) => k.ready)
    .sort((a, b) => a.pMastery - b.pMastery);

  // If no KCs are ready (all blocked by prerequisites), return the blockers
  if (readyKCs.length === 0) {
    return NextResponse.json({
      lessonComplete: false,
      blocked: true,
      message: "Prerequisites not yet met for remaining KCs",
      kcReadiness,
    });
  }

  // Target the lowest-mastery ready KC
  const targetKcId = readyKCs[0].kcId;

  // Get recently attempted problem IDs (last 10 responses) to avoid repetition
  const recentResponses = await db.problemResponse.findMany({
    where: { studentId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { problemId: true },
  });
  const recentProblemIds = new Set(recentResponses.map((r) => r.problemId));

  // Find problems targeting this KC, preferring ones not recently attempted
  const targetProblems = problems.filter((p) =>
    p.kcs.some((k) => k.kcId === targetKcId)
  );

  // Prefer unseen problems, then least-recently-seen
  const unseenProblems = targetProblems.filter((p) => !recentProblemIds.has(p.id));
  const selected = unseenProblems.length > 0 ? unseenProblems[0] : targetProblems[0];

  return NextResponse.json({
    lessonComplete: false,
    problem: {
      id: selected.id,
      title: selected.title,
      difficulty: selected.difficulty,
      content: selected.content,
    },
    targetKc: {
      id: targetKcId,
      pMastery: readyKCs[0].pMastery,
      totalAttempts: masteryMap.get(targetKcId)?.totalAttempts ?? 0,
      correctCount: masteryMap.get(targetKcId)?.correctCount ?? 0,
    },
    progress: {
      totalKCs: lessonKcIds.length,
      masteredKCs: lessonKcIds.length - kcReadiness.length,
      readyKCs: readyKCs.length,
    },
  });
}
