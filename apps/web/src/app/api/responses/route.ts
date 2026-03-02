import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bktUpdate, MASTERY_THRESHOLD } from "@primer/shared";
import { auth } from "@clerk/nextjs/server";
import { ensureUser } from "@/lib/ensure-user";

/**
 * POST /api/responses
 *
 * Submit a problem step response. This is the core learning loop:
 * 1. Record the response
 * 2. Run BKT update for each KC on the step
 * 3. Check for mastery transitions
 * 4. Return updated mastery states
 */
export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Look up or create internal user from Clerk ID
  const user = await ensureUser(clerkId);

  const body = await req.json();
  const {
    problemId,
    stepIndex,
    correct,
    responseTimeMs,
    hintsUsed,
    attemptNumber,
    kcIds,
  } = body as {
    problemId: string;
    stepIndex: number;
    correct: boolean;
    responseTimeMs: number;
    hintsUsed: number;
    attemptNumber: number;
    kcIds: string[];
  };

  if (!problemId || stepIndex === undefined || correct === undefined || !kcIds?.length) {
    return NextResponse.json(
      { error: "Missing required fields: problemId, stepIndex, correct, kcIds" },
      { status: 400 }
    );
  }

  // Record the response
  const response = await db.problemResponse.create({
    data: {
      studentId: user.id,
      problemId,
      stepIndex,
      kcId: kcIds[0], // Primary KC
      correct,
      responseTime: responseTimeMs ?? 0,
      hintsUsed: hintsUsed ?? 0,
      attemptNumber: attemptNumber ?? 1,
    },
  });

  // BKT update for each KC on this step
  const masteryUpdates = [];

  for (const kcId of kcIds) {
    // Get or create mastery state
    let mastery = await db.studentMasteryState.findUnique({
      where: { studentId_kcId: { studentId: user.id, kcId } },
    });

    if (!mastery) {
      mastery = await db.studentMasteryState.create({
        data: {
          studentId: user.id,
          kcId,
          pMastery: 0.1,
          pInit: 0.1,
          pTransit: 0.2,
          pSlip: 0.1,
          pGuess: 0.25,
        },
      });
    }

    // Run BKT update
    const result = bktUpdate(
      {
        pMastery: mastery.pMastery,
        pInit: mastery.pInit,
        pTransit: mastery.pTransit,
        pSlip: mastery.pSlip,
        pGuess: mastery.pGuess,
      },
      correct
    );

    // Persist updated mastery
    const updated = await db.studentMasteryState.update({
      where: { id: mastery.id },
      data: {
        pMastery: result.pMastery,
        totalAttempts: { increment: 1 },
        correctCount: correct ? { increment: 1 } : undefined,
        lastAttemptAt: new Date(),
        // Set masteredAt on first mastery transition
        masteredAt:
          result.isMastered && !result.wasMastered ? new Date() : undefined,
      },
    });

    masteryUpdates.push({
      kcId,
      pMastery: result.pMastery,
      pCorrect: result.pCorrect,
      isMastered: result.isMastered,
      justMastered: result.isMastered && !result.wasMastered,
    });
  }

  return NextResponse.json({
    responseId: response.id,
    masteryUpdates,
  });
}
