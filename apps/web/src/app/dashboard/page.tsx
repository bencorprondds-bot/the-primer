import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { MASTERY_THRESHOLD } from "@primer/shared";
import Link from "next/link";
import { MasteryBar } from "@/components/mastery-bar";
import { ensureUser } from "@/lib/ensure-user";
import { getStreak } from "@/lib/streaks";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  // Ensure user exists in DB (auto-creates from Clerk on first visit)
  const baseUser = await ensureUser(clerkId);

  // Re-fetch with all the relations we need for the dashboard
  const user = await db.user.findUniqueOrThrow({
    where: { id: baseUser.id },
    include: {
      masteryStates: {
        include: {
          kc: true,
        },
        orderBy: { updatedAt: "desc" },
      },
      enrollments: {
        include: {
          course: {
            include: {
              modules: {
                include: {
                  lessons: {
                    include: {
                      problems: {
                        include: { kcs: true },
                      },
                    },
                    orderBy: { orderIndex: "asc" },
                  },
                },
                orderBy: { orderIndex: "asc" },
              },
            },
          },
        },
      },
      responses: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          problem: {
            select: { title: true, lessonId: true },
          },
        },
      },
    },
  });

  const streak = await getStreak(baseUser.id);

  // Build mastery summary
  const masteryStates = user.masteryStates;
  const totalKCs = masteryStates.length;
  const masteredKCs = masteryStates.filter(
    (ms) => ms.pMastery >= MASTERY_THRESHOLD
  ).length;
  const inProgressKCs = masteryStates.filter(
    (ms) => ms.pMastery > 0.1 && ms.pMastery < MASTERY_THRESHOLD
  ).length;
  const overallMastery =
    totalKCs > 0
      ? masteryStates.reduce((sum, ms) => sum + ms.pMastery, 0) / totalKCs
      : 0;

  // Recent activity
  const recentResponses = user.responses;
  const todayResponses = recentResponses.filter(
    (r) =>
      r.createdAt.toDateString() === new Date().toDateString()
  );
  const todayCorrect = todayResponses.filter((r) => r.correct).length;

  // Get all KCs across enrolled courses (for showing unstarted ones)
  const enrolledCourseKcIds = new Set<string>();
  for (const enrollment of user.enrollments) {
    for (const mod of enrollment.course.modules) {
      for (const lesson of mod.lessons) {
        for (const problem of lesson.problems) {
          for (const pk of problem.kcs) {
            enrolledCourseKcIds.add(pk.kcId);
          }
        }
      }
    }
  }
  const unstartedKCCount = [...enrolledCourseKcIds].filter(
    (kcId) => !masteryStates.some((ms) => ms.kcId === kcId)
  ).length;

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">My Progress</h1>
          <p className="text-muted-foreground mt-1">
            {user.name ?? "Student"} · Mastery Dashboard
          </p>
        </div>
        <div className="flex items-center gap-4">
          {streak.current > 0 && (
            <span className="text-sm">
              🔥 {streak.current} day{streak.current !== 1 ? "s" : ""}
            </span>
          )}
          <Link
            href="/learn"
            className="text-sm px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Continue Learning
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Overall Mastery"
          value={`${Math.round(overallMastery * 100)}%`}
          detail={`${totalKCs} skills tracked`}
        />
        <StatCard
          label="Skills Mastered"
          value={`${masteredKCs}`}
          detail={`of ${totalKCs + unstartedKCCount} total`}
        />
        <StatCard
          label="In Progress"
          value={`${inProgressKCs}`}
          detail={`${unstartedKCCount} not started`}
        />
        <StatCard
          label="Today"
          value={`${todayResponses.length}`}
          detail={`${todayCorrect} correct`}
        />
      </div>

      {/* Mastery by KC */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Knowledge Components</h2>
        {masteryStates.length === 0 ? (
          <div className="border border-border rounded-lg p-8 text-center text-muted-foreground">
            <p className="text-lg mb-2">No mastery data yet</p>
            <p className="text-sm">
              Start solving problems in a{" "}
              <Link href="/courses" className="text-primary hover:underline">
                course
              </Link>{" "}
              to see your progress here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {masteryStates
              .sort((a, b) => b.pMastery - a.pMastery)
              .map((ms) => (
                <MasteryBar
                  key={ms.id}
                  name={ms.kc.name}
                  pMastery={ms.pMastery}
                  totalAttempts={ms.totalAttempts}
                  correctCount={ms.correctCount}
                  masteredAt={ms.masteredAt?.toISOString() ?? null}
                  threshold={MASTERY_THRESHOLD}
                />
              ))}
          </div>
        )}
      </section>

      {/* Recent Activity */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
        {recentResponses.length === 0 ? (
          <p className="text-muted-foreground text-sm">No activity yet.</p>
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border">
            {recentResponses.slice(0, 10).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={
                      r.correct ? "text-green-500" : "text-red-400"
                    }
                  >
                    {r.correct ? "✓" : "✗"}
                  </span>
                  <span>{r.problem.title}</span>
                  <span className="text-muted-foreground">
                    Step {r.stepIndex + 1}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {formatTimeAgo(r.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="border border-border rounded-lg p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{detail}</div>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
