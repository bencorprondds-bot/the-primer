/**
 * Content schema for The Primer.
 *
 * This defines the contract between content authoring and the platform.
 * Any JSON file that validates against these types can be loaded as content.
 * Adding content is a DATA problem, not a CODE problem.
 */

// ─── Knowledge Components ────────────────────────────────────

export interface KCDefinition {
  /** Unique identifier, e.g., "kc_place_value_4digit" */
  id: string;
  /** Human-readable name, e.g., "Place Value in 4-Digit Numbers" */
  name: string;
  /** Detailed description of what mastery means */
  description: string;
  /** Subject area */
  subject: "MATH" | "SCIENCE" | "ELA" | "SOCIAL_STUDIES";
  /** Applicable grade levels */
  gradeLevels: number[];
  /** IDs of prerequisite KCs (must master these first) */
  prerequisites: string[];
  /** Texas TEKS alignment code, e.g., "5.2A" */
  teksCode?: string;
  /** Common Core alignment code (for non-TX states), e.g., "5.NBT.1" */
  ccssCode?: string;
}

// ─── Problems ────────────────────────────────────────────────

export interface HintDefinition {
  /** Hint progression type */
  type: "scaffold" | "more_specific" | "bottom_out";
  /** Hint content (supports $...$ KaTeX notation) */
  content: string;
}

export interface StepDefinition {
  /** Unique step ID within the problem */
  id: string;
  /** The prompt/question for this step (supports $...$ KaTeX) */
  prompt: string;
  /** The correct answer */
  correctAnswer: string;
  /** Alternative acceptable formats for the answer */
  acceptableFormats?: string[];
  /** KC IDs this step assesses */
  kcs: string[];
  /** Progressive hints: scaffold → more specific → bottom out */
  hints: HintDefinition[];
  /** Optional explanation shown after correct answer */
  explanation?: string;
}

export interface ProblemDefinition {
  /** Unique problem ID, e.g., "prob_pv_001" */
  id: string;
  /** Problem title/summary */
  title: string;
  /** Difficulty 1-5 */
  difficulty: number;
  /** Problem context/setup text (supports $...$ KaTeX) */
  context?: string;
  /** Ordered steps to solve the problem */
  steps: StepDefinition[];
}

// ─── Lessons, Modules, Courses ───────────────────────────────

export interface LessonDefinition {
  /** Unique lesson ID */
  id: string;
  /** Lesson title */
  title: string;
  /** Lesson introduction/explanation (Markdown with KaTeX) */
  content?: string;
  /** Ordered problems in this lesson */
  problems: ProblemDefinition[];
}

export interface ModuleDefinition {
  /** Unique module ID */
  id: string;
  /** Module title */
  title: string;
  /** Module description */
  description?: string;
  /** Ordered lessons */
  lessons: LessonDefinition[];
}

export interface CourseDefinition {
  /** Unique course ID, e.g., "tx-math-g5" */
  id: string;
  /** Course title */
  title: string;
  /** Course description */
  description: string;
  /** Subject */
  subject: "MATH" | "SCIENCE" | "ELA" | "SOCIAL_STUDIES";
  /** Target grade levels */
  gradeLevels: number[];
  /** State standard alignment */
  standardsAlignment?: string;
  /** Content license */
  license: string;
  /** Attribution for CC content */
  attribution?: string;
  /** Knowledge Components defined for this course */
  knowledgeComponents: KCDefinition[];
  /** Ordered modules */
  modules: ModuleDefinition[];
}

// ─── Validation ──────────────────────────────────────────────

export interface ValidationError {
  path: string;
  message: string;
}

/**
 * Validates a CourseDefinition, checking:
 * - All KC references in problems point to defined KCs
 * - All KC prerequisites reference defined KCs
 * - Every problem has at least one step
 * - Every step has at least one hint
 * - Every step references at least one KC
 * - Difficulty is 1-5
 * - No duplicate IDs
 */
export function validateCourse(course: CourseDefinition): ValidationError[] {
  const errors: ValidationError[] = [];
  const kcIds = new Set(course.knowledgeComponents.map((kc) => kc.id));
  const allIds = new Set<string>();

  // Check KC prerequisites
  for (const kc of course.knowledgeComponents) {
    if (allIds.has(kc.id)) {
      errors.push({ path: `kc.${kc.id}`, message: `Duplicate KC ID: ${kc.id}` });
    }
    allIds.add(kc.id);

    for (const prereq of kc.prerequisites) {
      if (!kcIds.has(prereq)) {
        errors.push({
          path: `kc.${kc.id}.prerequisites`,
          message: `Prerequisite "${prereq}" not found in course KCs`,
        });
      }
    }
  }

  // Check modules, lessons, problems
  for (const mod of course.modules) {
    if (allIds.has(mod.id)) {
      errors.push({ path: `module.${mod.id}`, message: `Duplicate module ID` });
    }
    allIds.add(mod.id);

    for (const lesson of mod.lessons) {
      if (allIds.has(lesson.id)) {
        errors.push({ path: `lesson.${lesson.id}`, message: `Duplicate lesson ID` });
      }
      allIds.add(lesson.id);

      if (lesson.problems.length === 0) {
        errors.push({
          path: `lesson.${lesson.id}`,
          message: "Lesson has no problems",
        });
      }

      for (const problem of lesson.problems) {
        if (allIds.has(problem.id)) {
          errors.push({ path: `problem.${problem.id}`, message: `Duplicate problem ID` });
        }
        allIds.add(problem.id);

        if (problem.difficulty < 1 || problem.difficulty > 5) {
          errors.push({
            path: `problem.${problem.id}.difficulty`,
            message: `Difficulty must be 1-5, got ${problem.difficulty}`,
          });
        }

        if (problem.steps.length === 0) {
          errors.push({
            path: `problem.${problem.id}`,
            message: "Problem has no steps",
          });
        }

        for (const step of problem.steps) {
          if (step.kcs.length === 0) {
            errors.push({
              path: `problem.${problem.id}.step.${step.id}`,
              message: "Step has no KC references",
            });
          }

          for (const kcRef of step.kcs) {
            if (!kcIds.has(kcRef)) {
              errors.push({
                path: `problem.${problem.id}.step.${step.id}`,
                message: `KC "${kcRef}" not found in course KCs`,
              });
            }
          }

          if (step.hints.length === 0) {
            errors.push({
              path: `problem.${problem.id}.step.${step.id}`,
              message: "Step has no hints (need at least one scaffold hint)",
            });
          }
        }
      }
    }
  }

  return errors;
}
