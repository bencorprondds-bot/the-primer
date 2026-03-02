import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureUser } from "@/lib/ensure-user";
import { db } from "@/lib/db";
import type { EngagementEventType } from "@prisma/client";

/**
 * POST /api/engagement
 *
 * Records an engagement event and updates daily aggregates.
 */
export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await ensureUser(clerkId);

  const body = await req.json();
  const { eventType, metadata } = body as {
    eventType: EngagementEventType;
    metadata?: Record<string, unknown>;
  };

  if (!eventType) {
    return NextResponse.json(
      { error: "Missing required field: eventType" },
      { status: 400 }
    );
  }

  // Record the event
  const event = await db.engagementEvent.create({
    data: {
      studentId: user.id,
      eventType,
      metadata: metadata ? (metadata as object) : undefined,
    },
  });

  // Update daily aggregate
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await db.engagementAggregate.upsert({
    where: {
      studentId_date: {
        studentId: user.id,
        date: today,
      },
    },
    update: {
      problemsAttempted:
        eventType === "PROBLEM_START" ? { increment: 1 } : undefined,
      problemsCompleted:
        eventType === "PROBLEM_COMPLETE" ? { increment: 1 } : undefined,
      hintsUsed:
        eventType === "HINT_REQUESTED" ? { increment: 1 } : undefined,
      tutorSessions:
        eventType === "TUTOR_OPENED" ? { increment: 1 } : undefined,
    },
    create: {
      studentId: user.id,
      date: today,
      problemsAttempted: eventType === "PROBLEM_START" ? 1 : 0,
      problemsCompleted: eventType === "PROBLEM_COMPLETE" ? 1 : 0,
      hintsUsed: eventType === "HINT_REQUESTED" ? 1 : 0,
      tutorSessions: eventType === "TUTOR_OPENED" ? 1 : 0,
    },
  });

  return NextResponse.json({ id: event.id });
}
