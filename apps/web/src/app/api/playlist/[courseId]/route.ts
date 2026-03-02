import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureUser } from "@/lib/ensure-user";
import { generatePlaylist } from "@/lib/playlist";

/**
 * GET /api/playlist/[courseId]
 *
 * Returns a personalized playlist for the authenticated student.
 * Items are sorted by priority: in-progress first, then available (lowest mastery),
 * then locked, then completed.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await ensureUser(clerkId);
  const { courseId } = await params;

  const { playlist, stats } = await generatePlaylist(user.id, courseId);

  return NextResponse.json({ playlist, stats });
}
