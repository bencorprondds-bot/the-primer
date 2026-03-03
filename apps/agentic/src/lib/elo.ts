/**
 * AGI-Elo: Joint rating system for agents and tasks.
 *
 * Based on arXiv 2505.12844 — a modified Glicko system that
 * simultaneously calibrates agent ability and task difficulty.
 *
 * Each entity (agent or task) has a Gaussian rating: N(mu, sigma^2)
 * - mu: mean rating (higher = more capable/harder)
 * - sigma: uncertainty (higher = less certain)
 *
 * After each attempt, both the agent's and task's ratings update
 * based on the outcome.
 */

export interface EloRating {
  mu: number;     // Mean rating
  sigma: number;  // Rating deviation (uncertainty)
}

export interface EloUpdateResult {
  agent: EloRating;   // Updated agent rating
  task: EloRating;    // Updated task rating
  expectedScore: number; // What the model predicted
}

// Constants
const DEFAULT_MU = 1500;
const DEFAULT_SIGMA = 350;
const K_BASE = 32;          // Base K-factor
const SIGMA_MIN = 50;       // Floor for uncertainty
const SIGMA_DECAY = 0.998;  // Per-update sigma decay (slow convergence)
const SCALE = 400;          // Elo scale factor

/**
 * Create a new default Elo rating.
 */
export function defaultEloRating(): EloRating {
  return { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA };
}

/**
 * Compute expected probability of the agent succeeding on the task.
 *
 * P(correct) = 1 / (1 + 10^((R_task - R_agent) / 400))
 *
 * Higher agent rating → higher P(correct)
 * Higher task rating → lower P(correct)
 */
export function expectedScore(agent: EloRating, task: EloRating): number {
  return 1 / (1 + Math.pow(10, (task.mu - agent.mu) / SCALE));
}

/**
 * Update both agent and task ratings after an attempt.
 *
 * @param agent - Current agent rating
 * @param task - Current task rating
 * @param score - Actual score [0.0, 1.0] (can use continuous scores!)
 * @returns Updated ratings for both sides
 *
 * Key design decisions:
 * - K-factor scales with uncertainty (more uncertain → bigger updates)
 * - Opponent uncertainty reduces update impact (stabilizing)
 * - Sigma decays toward a floor over time (increasing confidence)
 * - Supports continuous scores, not just binary win/loss
 */
export function eloUpdate(
  agent: EloRating,
  task: EloRating,
  score: number
): EloUpdateResult {
  const expected = expectedScore(agent, task);
  const surprise = score - expected;

  // K-factor: base * (own uncertainty / scale)
  // Higher uncertainty → bigger updates → faster convergence
  const kAgent = K_BASE * (agent.sigma / DEFAULT_SIGMA);
  const kTask = K_BASE * (task.sigma / DEFAULT_SIGMA);

  // Opponent uncertainty discount: high opponent sigma → reduce update
  // This prevents volatile entities from destabilizing stable ones
  const agentDiscount = 1 / (1 + task.sigma / DEFAULT_SIGMA);
  const taskDiscount = 1 / (1 + agent.sigma / DEFAULT_SIGMA);

  // Update ratings
  const newAgentMu = agent.mu + kAgent * agentDiscount * surprise;
  const newTaskMu = task.mu - kTask * taskDiscount * surprise;

  // Decay sigma toward floor (more attempts → more confidence)
  const newAgentSigma = Math.max(SIGMA_MIN, agent.sigma * SIGMA_DECAY);
  const newTaskSigma = Math.max(SIGMA_MIN, task.sigma * SIGMA_DECAY);

  return {
    agent: { mu: newAgentMu, sigma: newAgentSigma },
    task: { mu: newTaskMu, sigma: newTaskSigma },
    expectedScore: expected,
  };
}

/**
 * Compute the competency gap between an agent and a target task level.
 *
 * Positive gap = agent is below the target.
 * Negative gap = agent exceeds the target.
 */
export function competencyGap(agent: EloRating, targetMu: number): number {
  return targetMu - agent.mu;
}

/**
 * Select the most informative next task from a candidate set.
 *
 * Uses a Maximum Fisher Information-like heuristic:
 * the most informative task is the one closest to the agent's
 * current rating (where expected score ≈ 0.5).
 *
 * With tie-breaking: prefer tasks with higher uncertainty (less calibrated).
 *
 * @param agent - Current agent rating
 * @param tasks - Array of { id, rating } for candidate tasks
 * @returns The task id that would be most informative
 */
export function selectMostInformativeTask(
  agent: EloRating,
  tasks: Array<{ id: string; rating: EloRating }>
): string | null {
  if (tasks.length === 0) return null;

  let bestId = tasks[0].id;
  let bestInfo = -Infinity;

  for (const task of tasks) {
    const p = expectedScore(agent, task.rating);
    // Fisher information is maximized when p ≈ 0.5
    // I(theta) ∝ p * (1-p) — maximum at p = 0.5
    const information = p * (1 - p);

    // Tie-break: prefer less-calibrated tasks (higher sigma)
    const adjustedInfo = information + (task.rating.sigma / DEFAULT_SIGMA) * 0.01;

    if (adjustedInfo > bestInfo) {
      bestInfo = adjustedInfo;
      bestId = task.id;
    }
  }

  return bestId;
}

/**
 * Estimate the confidence level of a rating.
 * Returns a value [0, 1] where 1 = very confident, 0 = very uncertain.
 */
export function ratingConfidence(rating: EloRating): number {
  return Math.max(0, 1 - (rating.sigma - SIGMA_MIN) / (DEFAULT_SIGMA - SIGMA_MIN));
}

// ─── Cold/Warm Elo Split ────────────────────────────────────

/**
 * Dual Elo tracking (from Gemini review feedback + Ben's refinement):
 *
 * Cold Elo = bare model capability (no error memory, no reflections)
 * Warm Elo = scaffolded agent capability (full memory + reflections)
 *
 * The delta between them measures how much the Primer's scaffolding
 * actually helps. This is THE metric that proves the Primer works.
 *
 * Interpreting the delta:
 * - warm >> cold: scaffolding is high-value, the Primer is teaching
 * - warm ≈ cold: the agent doesn't benefit from reflections
 * - warm < cold: scaffolding is noise (hurting more than helping)
 *
 * Note on what's being rated (Ben's insight):
 * The Elo rating belongs to the scaffolded agent system
 * (model + memory + Primer scaffolding), not just the bare model.
 * This is intentional — we're developing agents, not benchmarking
 * models. The cold track exists to prove the scaffolding helps,
 * not as the "real" rating.
 */
export interface DualEloRating {
  cold: EloRating;  // Attempts WITHOUT reflections/memory prepended
  warm: EloRating;  // Attempts WITH reflections/memory prepended
}

export function defaultDualEloRating(): DualEloRating {
  return {
    cold: defaultEloRating(),
    warm: defaultEloRating(),
  };
}

/**
 * Compute scaffolding effectiveness — how much the Primer helps.
 *
 * Returns the mu difference (warm - cold).
 * Positive = scaffolding helps. Negative = scaffolding hurts.
 */
export function scaffoldingEffectiveness(dual: DualEloRating): number {
  return dual.warm.mu - dual.cold.mu;
}

/**
 * Select which Elo track to update based on attempt context.
 */
export function selectEloTrack(
  dual: DualEloRating,
  hadReflections: boolean
): { track: "cold" | "warm"; rating: EloRating } {
  return hadReflections
    ? { track: "warm", rating: dual.warm }
    : { track: "cold", rating: dual.cold };
}
