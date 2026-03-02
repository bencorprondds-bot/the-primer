import { db } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const courses = await db.course.findMany({
    where: { published: true },
    include: {
      modules: {
        include: {
          lessons: {
            include: {
              _count: { select: { problems: true } },
            },
          },
        },
        orderBy: { orderIndex: "asc" },
      },
    },
  });

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Courses</h1>
      <p className="text-muted-foreground mb-8">
        Choose a course to begin learning.
      </p>

      <div className="space-y-6">
        {courses.map((course) => {
          const totalLessons = course.modules.reduce(
            (sum, m) => sum + m.lessons.length,
            0
          );
          const totalProblems = course.modules.reduce(
            (sum, m) =>
              sum +
              m.lessons.reduce((s, l) => s + l._count.problems, 0),
            0
          );

          return (
            <div
              key={course.id}
              className="border border-border rounded-lg p-6 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{course.title}</h2>
                  <p className="text-muted-foreground mt-1">
                    {course.description}
                  </p>
                  <div className="flex gap-4 mt-3 text-sm text-muted-foreground">
                    <span>
                      {course.gradeLevel.map((g) => `Grade ${g}`).join(", ")}
                    </span>
                    <span>{course.modules.length} modules</span>
                    <span>{totalLessons} lessons</span>
                    <span>{totalProblems} problems</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {course.modules.map((mod) => (
                  <div key={mod.id} className="pl-4 border-l-2 border-border">
                    <h3 className="font-medium">{mod.title}</h3>
                    <div className="mt-1 space-y-1">
                      {mod.lessons.map((lesson) => (
                        <Link
                          key={lesson.id}
                          href={`/courses/${course.id}/${lesson.id}`}
                          className="block text-sm text-primary hover:underline pl-2"
                        >
                          {lesson.title}{" "}
                          <span className="text-muted-foreground">
                            ({lesson._count.problems} problems)
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
