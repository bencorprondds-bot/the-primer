/**
 * BKT Engine — Agent-specific Bayesian Knowledge Tracing.
 *
 * Self-contained implementation for the agentic app. While the human Primer
 * uses @primer/shared's BKT, the agentic version has fundamentally different
 * assumptions:
 *
 * - pGuess = 0.05 (not 0.25) — agents don't randomly guess on tool calls
 * - pTransit = 0.2 — kept for progression mechanics, though agents don't
 *   actually "learn" between attempts. What changes is OUR knowledge of
 *   their capability, not the capability itself.
 * - Higher mastery threshold (0.95) — we want high confidence before
 *   declaring an agent has mastered a capability
 *
 * Core equations: Corbett & Anderson (1995), "Knowledge Tracing: Modeling
 * the Acquisition of Procedural Knowledge"
 */

// ─── Types ─────────────────────────────────────────────────────

export interface BKTParams {
  pMastery: number;  // Current P(L) estimate
  pInit: number;     // P(L₀) — prior
  pTransit: number;  // P(T) — "learning" rate (really: measurement refinement)
  pSlip: number;     // P(S) — slip probability
  pGuess: number;    // P(G) — guess probability
}

export interface BKTUpdateResult {
  pMastery: number;    // Updated P(L) after observation
  pCorrect: number;    // Model-predicted probability of correct response
  isMastered: boolean; // Whether P(L) >= threshold after update
  wasMastered: boolean; // Whether P(L) >= threshold before update
}

// ─── Constants ─────────────────────────────────────────────────

export const AGENT_MASTERY_THRESHOLD = 0.95;

export const AGENT_BKT_DEFAULTS = {
  pInit: 0.1,
  pTransit: 0.2,
  pSlip: 0.1,
  pGuess: 0.05,  // Much lower than human (0.25) — agents don't random-guess
} as const;

// ─── Core Functions ────────────────────────────────────────────

/**
 * Update BKT mastery estimate after observing a response.
 *
 * Step 1: Compute P(correct) under the model
 * Step 2: Apply Bayes' theorem to get P(mastered | observation)
 * Step 3: Apply transition: refine our estimate of agent capability
 */
export function bktUpdate(
  params: BKTParams,
  correct: boolean
): BKTUpdateResult {
  const { pMastery, pTransit, pSlip, pGuess } = params;
  const wasMastered = pMastery >= AGENT_MASTERY_THRESHOLD;

  let pMasteryGivenObs: number;
  let pObs: number;

  if (correct) {
    // P(correct) = P(L) * (1 - P(S)) + (1 - P(L)) * P(G)
    pObs = pMastery * (1 - pSlip) + (1 - pMastery) * pGuess;
    // P(L | correct) = P(L) * (1 - P(S)) / P(correct)
    pMasteryGivenObs = (pMastery * (1 - pSlip)) / pObs;
  } else {
    // P(incorrect) = P(L) * P(S) + (1 - P(L)) * (1 - P(G))
    pObs = pMastery * pSlip + (1 - pMastery) * (1 - pGuess);
    // P(L | incorrect) = P(L) * P(S) / P(incorrect)
    pMasteryGivenObs = (pMastery * pSlip) / pObs;
  }

  // Apply transition:
  // P(L_new) = P(L | obs) + (1 - P(L | obs)) * P(T)
  const pMasteryNew =
    pMasteryGivenObs + (1 - pMasteryGivenObs) * pTransit;

  // Clamp to [0.001, 0.999] to avoid degenerate probabilities
  const clamped = Math.max(0.001, Math.min(0.999, pMasteryNew));

  return {
    pMastery: clamped,
    pCorrect: pObs,
    isMastered: clamped >= AGENT_MASTERY_THRESHOLD,
    wasMastered,
  };
}

/**
 * Compute predicted P(correct) given current mastery state.
 */
export function predictCorrect(params: BKTParams): number {
  return (
    params.pMastery * (1 - params.pSlip) +
    (1 - params.pMastery) * params.pGuess
  );
}

/**
 * Estimate opportunities needed to reach mastery (simulating correct responses).
 * Returns Infinity if convergence unlikely.
 */
export function estimateToMastery(params: BKTParams, maxIter = 100): number {
  let p = params.pMastery;
  if (p >= AGENT_MASTERY_THRESHOLD) return 0;

  for (let i = 1; i <= maxIter; i++) {
    const pCorrect = p * (1 - params.pSlip) + (1 - p) * params.pGuess;
    const pGivenCorrect = (p * (1 - params.pSlip)) / pCorrect;
    p = pGivenCorrect + (1 - pGivenCorrect) * params.pTransit;
    if (p >= AGENT_MASTERY_THRESHOLD) return i;
  }

  return Infinity;
}

/**
 * Create default BKT params for a new agent-capability pair.
 */
export function defaultAgentBKTParams(): BKTParams {
  return {
    pMastery: AGENT_BKT_DEFAULTS.pInit,
    pInit: AGENT_BKT_DEFAULTS.pInit,
    pTransit: AGENT_BKT_DEFAULTS.pTransit,
    pSlip: AGENT_BKT_DEFAULTS.pSlip,
    pGuess: AGENT_BKT_DEFAULTS.pGuess,
  };
}
