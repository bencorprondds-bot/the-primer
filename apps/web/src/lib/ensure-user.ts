import { db } from "@/lib/db";
import { clerkClient } from "@clerk/nextjs/server";

/**
 * Ensures a User row exists in Prisma for the given Clerk user.
 * On first request, pulls email/name from Clerk and creates the row.
 * Auto-enrolls the student in the first published course.
 */
export async function ensureUser(clerkId: string) {
  // Fast path: user already exists
  let user = await db.user.findUnique({ where: { clerkId } });
  if (user) return user;

  // Slow path: create from Clerk data
  const client = await clerkClient();
  const clerkUser = await client.users.getUser(clerkId);
  const email =
    clerkUser.emailAddresses[0]?.emailAddress ?? `${clerkId}@primer.local`;
  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null;

  try {
    user = await db.user.create({
      data: { clerkId, email, name, role: "STUDENT" },
    });

    // Auto-enroll in the first published course
    const defaultCourse = await db.course.findFirst({
      where: { published: true },
    });
    if (defaultCourse) {
      await db.enrollment
        .create({
          data: { studentId: user.id, courseId: defaultCourse.id },
        })
        .catch(() => {}); // Ignore if already enrolled
    }
  } catch (e: unknown) {
    // Race condition: another request created the user simultaneously
    if (
      e instanceof Error &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      user = await db.user.findUnique({ where: { clerkId } });
      if (!user) throw e;
    } else {
      throw e;
    }
  }

  return user;
}
