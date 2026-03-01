/**
 * Content seed script.
 * Reads course JSON from content/ directory, validates, and inserts into PostgreSQL.
 *
 * Usage: npx tsx src/lib/seed.ts
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";
import {
  type CourseDefinition,
  validateCourse,
} from "@primer/shared/src/content-schema";

const db = new PrismaClient();

async function seedCourse(coursePath: string) {
  const raw = readFileSync(coursePath, "utf-8");
  const course: CourseDefinition = JSON.parse(raw);

  // Validate
  const errors = validateCourse(course);
  if (errors.length > 0) {
    console.error(`Validation errors in ${coursePath}:`);
    for (const err of errors) {
      console.error(`  [${err.path}] ${err.message}`);
    }
    process.exit(1);
  }

  console.log(`Seeding course: ${course.title}`);
  console.log(
    `  ${course.knowledgeComponents.length} KCs, ${course.modules.length} modules`
  );

  // Upsert course
  const dbCourse = await db.course.upsert({
    where: { id: course.id },
    update: {
      title: course.title,
      description: course.description,
      subject: course.subject,
      gradeLevel: course.gradeLevels,
      published: true,
    },
    create: {
      id: course.id,
      title: course.title,
      description: course.description,
      subject: course.subject,
      gradeLevel: course.gradeLevels,
      published: true,
    },
  });

  // Upsert KCs
  for (const kc of course.knowledgeComponents) {
    await db.knowledgeComponent.upsert({
      where: { id: kc.id },
      update: {
        name: kc.name,
        description: kc.description,
        subject: kc.subject,
        gradeLevel: kc.gradeLevels,
      },
      create: {
        id: kc.id,
        name: kc.name,
        description: kc.description,
        subject: kc.subject,
        gradeLevel: kc.gradeLevels,
      },
    });
  }

  // Upsert KC prerequisites
  for (const kc of course.knowledgeComponents) {
    for (const prereqId of kc.prerequisites) {
      await db.kCPrerequisite.upsert({
        where: {
          prerequisiteId_dependentId: {
            prerequisiteId: prereqId,
            dependentId: kc.id,
          },
        },
        update: {},
        create: {
          prerequisiteId: prereqId,
          dependentId: kc.id,
        },
      });
    }
  }

  // Upsert modules, lessons, problems
  for (let mi = 0; mi < course.modules.length; mi++) {
    const mod = course.modules[mi];

    const dbModule = await db.module.upsert({
      where: { id: mod.id },
      update: {
        title: mod.title,
        orderIndex: mi,
        courseId: dbCourse.id,
      },
      create: {
        id: mod.id,
        title: mod.title,
        orderIndex: mi,
        courseId: dbCourse.id,
      },
    });

    for (let li = 0; li < mod.lessons.length; li++) {
      const lesson = mod.lessons[li];

      const dbLesson = await db.lesson.upsert({
        where: { id: lesson.id },
        update: {
          title: lesson.title,
          content: lesson.content ?? null,
          orderIndex: li,
          moduleId: dbModule.id,
        },
        create: {
          id: lesson.id,
          title: lesson.title,
          content: lesson.content ?? null,
          orderIndex: li,
          moduleId: dbModule.id,
        },
      });

      for (let pi = 0; pi < lesson.problems.length; pi++) {
        const problem = lesson.problems[pi];

        const dbProblem = await db.problem.upsert({
          where: { id: problem.id },
          update: {
            title: problem.title,
            difficulty: problem.difficulty,
            content: problem as unknown as object,
            orderIndex: pi,
            lessonId: dbLesson.id,
          },
          create: {
            id: problem.id,
            title: problem.title,
            difficulty: problem.difficulty,
            content: problem as unknown as object,
            orderIndex: pi,
            lessonId: dbLesson.id,
          },
        });

        // Link problem to KCs
        const kcIds = new Set<string>();
        for (const step of problem.steps) {
          for (const kcId of step.kcs) {
            kcIds.add(kcId);
          }
        }

        for (const kcId of kcIds) {
          await db.problemKC.upsert({
            where: {
              problemId_kcId: {
                problemId: dbProblem.id,
                kcId,
              },
            },
            update: {},
            create: {
              problemId: dbProblem.id,
              kcId,
            },
          });
        }
      }
    }
  }

  const totalProblems = course.modules.reduce(
    (sum, m) => sum + m.lessons.reduce((s, l) => s + l.problems.length, 0),
    0
  );
  console.log(`  Seeded: ${totalProblems} problems across ${course.modules.reduce((s, m) => s + m.lessons.length, 0)} lessons`);
}

async function main() {
  const contentDir = join(__dirname, "..", "..", "..", "..", "content");

  // Seed TX Grade 5
  await seedCourse(join(contentDir, "tx-math-g5", "course.json"));

  console.log("\nSeed complete!");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
