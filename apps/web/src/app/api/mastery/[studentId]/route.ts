import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { MASTERY_THRESHOLD } from "@primer/shared";
import { ensureUser } from "@/lib/ensure-user";

/**
 * GET /api/mastery/[studentId]
 *
 * Returns all KC mastery states for a student, optionally filtered by course.
 * Students can only see their own mastery. Guides/Admins can see any student.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { studentId } = await params;

  const user = await ensureUser(clerkId);

  // Authorization: students see only their own data, guides/admins see all
  if (user.role === "STUDENT" && user.id !== studentId && studentId !== "me") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolvedId = studentId === "me" ? user.id : studentId;

  // Optional course filter
  const courseId = req.nextUrl.searchParams.get("courseId");

  // Get all mastery states
  const masteryStates = await db.studentMasteryState.findMany({
    where: { studentId: resolvedId },
    include: {
      kc: {
        select: {
          id: true,
          name: true,
          subject: true,
          gradeLevel: true,
        },
      },
    },
    orderBy: { kc: { name: "asc" } },
  });

  // If course filter, get KCs for that course and filter
  let filtered = masteryStates;
  if (courseId) {
    const courseKCs = await db.problemKC.findMany({
      where: {
        problem: { lesson: { module: { courseId } } },
      },
      select: { kcId: true },
      distinct: ["kcId"],
    });
    const kcIdSet = new Set(courseKCs.map((pk) => pk.kcId));
    filtered = masteryStates.filter((ms) => kcIdSet.has(ms.kcId));
  }

  // Shape the response
  const mastery = filtered.map((ms) => ({
    kcId: ms.kcId,
    kcName: ms.kc.name,
    pMastery: ms.pMastery,
    isMastered: ms.pMastery >= MASTERY_THRESHOLD,
    totalAttempts: ms.totalAttempts,
    correctCount: ms.correctCount,
    accuracy: ms.totalAttempts > 0 ? ms.correctCount / ms.totalAttempts : 0,
    lastAttemptAt: ms.lastAttemptAt,
    masteredAt: ms.masteredAt,
  }));

  // Summary stats
  const total = mastery.length;
  const mastered = mastery.filter((m) => m.isMastered).length;

  return NextResponse.json({
    studentId: resolvedId,
    mastery,
    summary: {
      totalKCs: total,
      masteredKCs: mastered,
      overallProgress: total > 0 ? mastered / total : 0,
    },
  });
}
