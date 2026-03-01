import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MathText } from "@primer/math-renderer";
import { ProblemViewer } from "@/components/problem-viewer";
import type { ProblemDefinition } from "@primer/shared/src/content-schema";

export const dynamic = "force-dynamic";

interface LessonPageProps {
  params: Promise<{ courseId: string; lessonId: string }>;
}

export default async function LessonPage({ params }: LessonPageProps) {
  const { courseId, lessonId } = await params;

  // Load the lesson with its problems and parent module/course info
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: {
      problems: {
        orderBy: { orderIndex: "asc" },
      },
      module: {
        include: {
          course: true,
          lessons: {
            orderBy: { orderIndex: "asc" },
            select: { id: true, title: true, orderIndex: true },
          },
        },
      },
    },
  });

  // Verify lesson exists and belongs to the right course
  if (!lesson || lesson.module.courseId !== courseId) {
    notFound();
  }

  const course = lesson.module.course;
  const moduleLessons = lesson.module.lessons;
  const currentIndex = moduleLessons.findIndex((l) => l.id === lessonId);
  const prevLesson = currentIndex > 0 ? moduleLessons[currentIndex - 1] : null;
  const nextLesson =
    currentIndex < moduleLessons.length - 1
      ? moduleLessons[currentIndex + 1]
      : null;

  // Cast JSON content to ProblemDefinition
  const problems: ProblemDefinition[] = lesson.problems.map((p) => ({
    ...(p.content as unknown as ProblemDefinition),
    id: p.id,
    title: p.title,
  }));

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/courses" className="hover:text-foreground transition-colors">
          Courses
        </Link>
        <span>/</span>
        <span>{course.title}</span>
        <span>/</span>
        <span>{lesson.module.title}</span>
        <span>/</span>
        <span className="text-foreground">{lesson.title}</span>
      </nav>

      {/* Lesson header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold">{lesson.title}</h1>
        <p className="text-muted-foreground mt-1">
          {lesson.module.title} · {lesson.problems.length} problems
        </p>
      </div>

      {/* Lesson content (instructional text) */}
      {lesson.content && (
        <div className="prose dark:prose-invert max-w-none mb-8 p-6 bg-muted/30 rounded-lg border border-border">
          <MathText content={lesson.content} />
        </div>
      )}

      {/* Problems */}
      <div className="space-y-6">
        <h2 className="text-lg font-semibold">
          Practice ({problems.length} problems)
        </h2>
        {problems.map((problem, i) => (
          <div key={problem.id}>
            <div className="text-sm text-muted-foreground mb-2">
              Problem {i + 1} of {problems.length}
            </div>
            <ProblemViewer problem={problem} />
          </div>
        ))}
      </div>

      {/* Lesson navigation */}
      <div className="flex justify-between items-center mt-10 pt-6 border-t border-border">
        {prevLesson ? (
          <Link
            href={`/courses/${courseId}/${prevLesson.id}`}
            className="text-sm text-primary hover:underline"
          >
            ← {prevLesson.title}
          </Link>
        ) : (
          <div />
        )}
        {nextLesson ? (
          <Link
            href={`/courses/${courseId}/${nextLesson.id}`}
            className="text-sm text-primary hover:underline"
          >
            {nextLesson.title} →
          </Link>
        ) : (
          <Link
            href="/courses"
            className="text-sm text-primary hover:underline"
          >
            ← Back to all courses
          </Link>
        )}
      </div>
    </main>
  );
}
