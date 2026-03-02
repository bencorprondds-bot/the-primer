import { db } from "@/lib/db";
import {
  MASTERY_THRESHOLD,
  estimateToMastery,
  type PlaylistItem,
} from "@primer/shared";

interface LessonWithKCs {
  id: string;
  title: string;
  orderIndex: number;
  moduleOrderIndex: number;
  kcIds: string[];
}

interface MasteryInfo {
  pMastery: number;
  totalAttempts: number;
  pInit: number;
  pTransit: number;
  pSlip: number;
  pGuess: number;
}

/**
 * Generate a personalized playlist for a student in a course.
 *
 * Algorithm:
 * 1. Gather all lessons with their KCs, sorted by curriculum order
 * 2. Get student mastery states + KC prerequisite graph
 * 3. For each lesson: compute aggregate mastery, determine status
 * 4. Sort available items by lowest mastery first, curriculum order as tiebreaker
 * 5. Cap at ~8 items per session
 */
export async function generatePlaylist(
  studentId: string,
  courseId: string
): Promise<{
  playlist: PlaylistItem[];
  stats: { total: number; completed: number; available: number; locked: number };
}> {
  // 1. Get all lessons in this course with their KC links
  const modules = await db.module.findMany({
    where: { courseId },
    include: {
      lessons: {
        include: {
          problems: {
            include: { kcs: { select: { kcId: true } } },
          },
        },
        orderBy: { orderIndex: "asc" },
      },
    },
    orderBy: { orderIndex: "asc" },
  });

  // Flatten to lessons with KC sets
  const lessons: LessonWithKCs[] = [];
  for (const mod of modules) {
    for (const lesson of mod.lessons) {
      const kcIds = [
        ...new Set(lesson.problems.flatMap((p) => p.kcs.map((k) => k.kcId))),
      ];
      lessons.push({
        id: lesson.id,
        title: lesson.title,
        orderIndex: lesson.orderIndex,
        moduleOrderIndex: mod.orderIndex,
        kcIds,
      });
    }
  }

  // 2. Collect all KC IDs from the course
  const allKcIds = [...new Set(lessons.flatMap((l) => l.kcIds))];

  // Get student mastery states
  const masteryStates = await db.studentMasteryState.findMany({
    where: {
      studentId,
      kcId: { in: allKcIds },
    },
  });
  const masteryMap = new Map<string, MasteryInfo>(
    masteryStates.map((ms) => [
      ms.kcId,
      {
        pMastery: ms.pMastery,
        totalAttempts: ms.totalAttempts,
        pInit: ms.pInit,
        pTransit: ms.pTransit,
        pSlip: ms.pSlip,
        pGuess: ms.pGuess,
      },
    ])
  );

  // Get KC prerequisites
  const prerequisites = await db.kCPrerequisite.findMany({
    where: { dependentId: { in: allKcIds } },
  });
  const prereqMap = new Map<string, string[]>();
  for (const p of prerequisites) {
    const deps = prereqMap.get(p.dependentId) ?? [];
    deps.push(p.prerequisiteId);
    prereqMap.set(p.dependentId, deps);
  }

  // 3. For each lesson, determine status
  const playlistItems: PlaylistItem[] = [];

  for (const lesson of lessons) {
    if (lesson.kcIds.length === 0) continue;

    // Compute aggregate mastery for this lesson's KCs
    const kcMasteries = lesson.kcIds.map(
      (kcId) => masteryMap.get(kcId)?.pMastery ?? 0.1
    );
    const avgMastery =
      kcMasteries.reduce((sum, m) => sum + m, 0) / kcMasteries.length;
    const allMastered = kcMasteries.every((m) => m >= MASTERY_THRESHOLD);

    // Check if student has any attempts on this lesson's KCs
    const hasAttempts = lesson.kcIds.some(
      (kcId) => (masteryMap.get(kcId)?.totalAttempts ?? 0) > 0
    );

    // Check prerequisites: all KCs in this lesson must have their prereqs mastered
    const prereqsMet = lesson.kcIds.every((kcId) => {
      const prereqs = prereqMap.get(kcId) ?? [];
      return prereqs.every((prereqId) => {
        const prereqMastery = masteryMap.get(prereqId)?.pMastery ?? 0;
        return prereqMastery >= MASTERY_THRESHOLD;
      });
    });

    // Determine status
    let status: PlaylistItem["status"];
    if (allMastered) {
      status = "completed";
    } else if (hasAttempts && prereqsMet) {
      status = "in_progress";
    } else if (prereqsMet) {
      status = "available";
    } else {
      status = "locked";
    }

    // Estimate minutes: ~2 min per practice opportunity needed
    let estimatedMinutes = 5; // default
    if (status === "completed") {
      estimatedMinutes = 0;
    } else {
      const totalOpps = lesson.kcIds.reduce((sum, kcId) => {
        const mastery = masteryMap.get(kcId);
        const opps = estimateToMastery({
          pMastery: mastery?.pMastery ?? 0.1,
          pInit: mastery?.pInit ?? 0.1,
          pTransit: mastery?.pTransit ?? 0.2,
          pSlip: mastery?.pSlip ?? 0.1,
          pGuess: mastery?.pGuess ?? 0.25,
        });
        return sum + (opps === Infinity ? 10 : opps);
      }, 0);
      estimatedMinutes = Math.max(2, Math.round(totalOpps * 2));
    }

    playlistItems.push({
      id: lesson.id,
      type: "lesson",
      title: lesson.title,
      kcIds: lesson.kcIds,
      estimatedMinutes,
      status,
      masteryRequired: avgMastery,
    });
  }

  // 4. Sort: in_progress first, then available (lowest mastery first), then locked, completed last
  const statusOrder = { in_progress: 0, available: 1, locked: 2, completed: 3 };
  playlistItems.sort((a, b) => {
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;
    // Within same status, sort by mastery (lowest first for actionable items)
    if (a.status === "available" || a.status === "in_progress") {
      return a.masteryRequired - b.masteryRequired;
    }
    // For locked/completed, maintain curriculum order
    return 0;
  });

  // 5. Stats
  const stats = {
    total: playlistItems.length,
    completed: playlistItems.filter((i) => i.status === "completed").length,
    available: playlistItems.filter(
      (i) => i.status === "available" || i.status === "in_progress"
    ).length,
    locked: playlistItems.filter((i) => i.status === "locked").length,
  };

  return { playlist: playlistItems, stats };
}
