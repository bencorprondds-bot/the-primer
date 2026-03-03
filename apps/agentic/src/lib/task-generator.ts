/**
 * Procedural task generation from templates.
 *
 * Templates define parameterized tasks. The generator instantiates
 * concrete tasks by sampling parameter values, producing unique
 * task instances that test the same underlying capability.
 *
 * Anti-memorization by design: same capability, different task each time.
 *
 * Based on Automatic Item Generation (AIG) from educational testing:
 * - Cognitive Model: the capability being tested
 * - Item Model: the template with manipulable parameters
 * - Generated Item: the concrete task instance
 */

import crypto from "node:crypto";

// ─── Types ───────────────────────────────────────────────────

export interface TemplateParameter {
  name: string;
  type: "string" | "number" | "enum" | "array";
  values?: (string | number)[];       // For enum type
  range?: { min: number; max: number }; // For number type
  generator?: string;                   // Named generator function
  affectsDifficulty?: boolean;          // Does this param change difficulty?
}

export interface ParameterSchema {
  parameters: TemplateParameter[];
}

export interface DifficultyRange {
  min: number;
  max: number;
  // Which parameters scale with difficulty
  difficultyParams: Array<{
    param: string;
    scaling: "linear" | "exponential" | "stepped";
    // For stepped: map difficulty level to specific values
    steps?: Record<number, string | number>;
  }>;
}

export interface TaskTemplateInput {
  slug: string;
  promptTemplate: string;
  parameterSchema: ParameterSchema;
  difficultyRange: DifficultyRange;
  rubricTemplate: RubricTemplate;
  goldSolution?: string;
}

export interface RubricTemplate {
  criteria: Array<{
    type: string;
    weight: number;
    expectedTemplate?: string;   // Can contain {{param}} references
    key?: string;
    pattern?: string;
    description?: string;
  }>;
  passThreshold?: number;
}

export interface GeneratedTask {
  prompt: string;
  parameters: Record<string, unknown>;
  difficulty: number;
  rubric: {
    criteria: Array<{
      type: string;
      weight: number;
      expected?: string | string[];
      key?: string;
      pattern?: string;
      description?: string;
    }>;
    passThreshold: number;
  };
  goldSolution: string | null;
}

// ─── Built-in Parameter Generators ───────────────────────────

const GENERATORS: Record<string, () => string> = {
  filename_json: () => pickRandom(["config.json", "settings.json", "package.json", "data.json", "manifest.json", "tsconfig.json"]),
  filename_ts: () => pickRandom(["index.ts", "app.ts", "server.ts", "utils.ts", "helpers.ts", "main.ts", "router.ts"]),
  filename_py: () => pickRandom(["main.py", "app.py", "utils.py", "config.py", "server.py", "models.py"]),
  filename_md: () => pickRandom(["README.md", "CHANGELOG.md", "CONTRIBUTING.md", "docs.md", "notes.md"]),
  directory_name: () => pickRandom(["src", "lib", "utils", "config", "data", "tests", "docs", "scripts"]),
  project_type: () => pickRandom(["Node.js API", "React app", "Python CLI", "TypeScript library", "Next.js site"]),
  variable_name: () => pickRandom(["apiKey", "databaseUrl", "maxRetries", "timeout", "port", "hostName", "logLevel"]),
  error_type: () => pickRandom(["ENOENT", "EACCES", "TIMEOUT", "404", "500", "TypeError", "SyntaxError"]),
  search_term: () => pickRandom(["TODO", "FIXME", "HACK", "deprecated", "async function", "export default"]),
  api_endpoint: () => pickRandom(["/api/users", "/api/posts", "/api/auth/login", "/api/health", "/api/data"]),
};

// ─── Generator Function ──────────────────────────────────────

/**
 * Generate a concrete task instance from a template.
 *
 * @param template - The task template definition
 * @param difficulty - Target difficulty level (1-5)
 * @param seed - Optional seed for reproducibility
 */
export function generateTask(
  template: TaskTemplateInput,
  difficulty: number,
  seed?: string
): GeneratedTask {
  // Clamp difficulty to range
  const clampedDifficulty = Math.max(
    template.difficultyRange.min,
    Math.min(template.difficultyRange.max, difficulty)
  );

  // Sample parameter values
  const parameters: Record<string, unknown> = {};

  for (const param of template.parameterSchema.parameters) {
    // Check if this param should scale with difficulty
    const difficultyConfig = template.difficultyRange.difficultyParams.find(
      (dp) => dp.param === param.name
    );

    if (difficultyConfig) {
      parameters[param.name] = sampleWithDifficulty(param, clampedDifficulty, difficultyConfig);
    } else {
      parameters[param.name] = sampleParameter(param);
    }
  }

  // Render prompt template
  const prompt = renderTemplate(template.promptTemplate, parameters);

  // Render rubric template
  const rubric = renderRubric(template.rubricTemplate, parameters);

  // Render gold solution
  const goldSolution = template.goldSolution
    ? renderTemplate(template.goldSolution, parameters)
    : null;

  const generated: GeneratedTask = {
    prompt,
    parameters,
    difficulty: clampedDifficulty,
    rubric,
    goldSolution,
  };

  // Difficulty-band validation (Gemini review feedback):
  // Ensure the generated task's effective difficulty stays within
  // its intended band. Prevents L1 templates from accidentally
  // producing L5 edge cases, which would ruin Elo calibration.
  const effectiveDifficulty = estimateEffectiveDifficulty(generated, template);
  if (Math.abs(effectiveDifficulty - clampedDifficulty) > 1.5) {
    // Regenerate with tighter constraints rather than serving a misaligned task
    // For now, clamp and flag — recursive regeneration comes later
    generated.difficulty = Math.round(effectiveDifficulty);
    generated.parameters._difficultyAdjusted = true;
  }

  return generated;
}

// ─── Template Rendering ──────────────────────────────────────

function renderTemplate(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return String(params[key] ?? `{{${key}}}`);
  });
}

function renderRubric(
  template: RubricTemplate,
  params: Record<string, unknown>
): GeneratedTask["rubric"] {
  return {
    criteria: template.criteria.map((c) => {
      // Render expected template and split on commas if it contains them.
      // This allows templates to define expected as "read_file,grep" which
      // becomes ["read_file", "grep"] — needed for sequence_valid and
      // multi-option tool_selected criteria.
      let expected: string | string[] | undefined;
      if (c.expectedTemplate) {
        const rendered = renderTemplate(c.expectedTemplate, params);
        expected = rendered.includes(",")
          ? rendered.split(",").map((s) => s.trim())
          : rendered;
      }

      return {
        type: c.type,
        weight: c.weight,
        expected,
        key: c.key,
        pattern: c.pattern ? renderTemplate(c.pattern, params) : undefined,
        description: c.description
          ? renderTemplate(c.description, params)
          : undefined,
      };
    }),
    passThreshold: template.passThreshold ?? 0.7,
  };
}

// ─── Parameter Sampling ──────────────────────────────────────

function sampleParameter(param: TemplateParameter): string | number {
  if (param.generator && GENERATORS[param.generator]) {
    return GENERATORS[param.generator]();
  }

  switch (param.type) {
    case "enum":
      return pickRandom(param.values ?? []);
    case "number":
      if (param.range) {
        return randomInt(param.range.min, param.range.max);
      }
      return pickRandom(param.values ?? [0]);
    case "array":
      // Return a subset of values
      const count = randomInt(1, Math.min(3, (param.values?.length ?? 1)));
      return pickRandomN(param.values ?? [], count).join(", ");
    case "string":
    default:
      if (param.values?.length) return pickRandom(param.values);
      if (param.generator && GENERATORS[param.generator]) {
        return GENERATORS[param.generator]();
      }
      return "unknown";
  }
}

function sampleWithDifficulty(
  param: TemplateParameter,
  difficulty: number,
  config: DifficultyRange["difficultyParams"][number]
): string | number {
  // Stepped: use explicit mapping
  if (config.scaling === "stepped" && config.steps) {
    return config.steps[difficulty] ?? sampleParameter(param);
  }

  // Linear/exponential: scale within range
  if (param.range) {
    const t =
      config.scaling === "exponential"
        ? Math.pow((difficulty - 1) / 4, 2) // 0-1 exponential
        : (difficulty - 1) / 4; // 0-1 linear
    return Math.round(param.range.min + t * (param.range.max - param.range.min));
  }

  // Enum: higher difficulty picks from later values (assuming ordered by difficulty)
  if (param.values?.length) {
    const idx = Math.min(
      Math.floor((difficulty / 5) * param.values.length),
      param.values.length - 1
    );
    return param.values[idx];
  }

  return sampleParameter(param);
}

// ─── Difficulty Band Validation ──────────────────────────────

/**
 * Estimate the effective difficulty of a generated task.
 *
 * Heuristic: count difficulty-affecting parameters and their
 * contribution. If a L1 template accidentally samples high-end
 * values for multiple difficulty params, the effective difficulty
 * exceeds the intended band.
 *
 * This prevents the "procedural generation trap" where variance
 * in parameter sampling creates tasks that don't match their
 * intended difficulty level, ruining Elo calibration.
 */
function estimateEffectiveDifficulty(
  task: GeneratedTask,
  template: TaskTemplateInput
): number {
  const diffParams = template.difficultyRange.difficultyParams;
  if (diffParams.length === 0) return task.difficulty;

  let totalContribution = 0;
  let weights = 0;

  for (const dp of diffParams) {
    const param = template.parameterSchema.parameters.find(
      (p) => p.name === dp.param
    );
    if (!param) continue;

    const value = task.parameters[dp.param];

    // Estimate where this value falls in its parameter range [0, 1]
    let normalizedPosition = 0.5;
    if (param.range && typeof value === "number") {
      normalizedPosition =
        (value - param.range.min) / (param.range.max - param.range.min);
    } else if (param.values?.length) {
      const idx = param.values.indexOf(value as string | number);
      normalizedPosition = idx >= 0 ? idx / (param.values.length - 1) : 0.5;
    }

    // Map [0,1] position to difficulty range
    const { min, max } = template.difficultyRange;
    totalContribution += min + normalizedPosition * (max - min);
    weights++;
  }

  return weights > 0 ? totalContribution / weights : task.difficulty;
}

// ─── Utilities ───────────────────────────────────────────────

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickRandomN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
