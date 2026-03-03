/**
 * Bayesian Knowledge Tracing (BKT) implementation.
 *
 * BKT models a student's latent mastery of a Knowledge Component (KC)
 * as a hidden Markov model with 4 parameters:
 *
 *   P(L₀) — initial mastery probability (prior)
 *   P(T)  — probability of learning/transitioning to mastery on each opportunity
 *   P(G)  — probability of guessing correctly without mastery
 *   P(S)  — probability of slipping (incorrect despite mastery)
 *
 * After each observation (correct/incorrect), we update P(L) using Bayes' theorem,
 * then apply the transition probability.
 *
 * Reference: Corbett & Anderson (1995), "Knowledge Tracing: Modeling the
 * Acquisition of Procedural Knowledge"
 *
 * Ported from OATutor's BKT-brain.js with TypeScript types.
 */

import { MASTERY_THRESHOLD, DEFAULT_BKT_PARAMS } from "./constants";

export interface BKTParams {
  pMastery: number; // Current P(L) estimate
  pInit: number; // P(L₀) — prior
  pTransit: number; // P(T) — learning rate
  pSlip: number; // P(S) — slip probability
  pGuess: number; // P(G) — guess probability
}

export interface BKTUpdateResult {
  pMastery: number; // Updated P(L) after observation
  pCorrect: number; // Model-predicted probability of correct response
  isMastered: boolean; // Whether P(L) >= threshold after update
  wasMastered: boolean; // Whether P(L) >= threshold before update
}

/**
 * Update BKT mastery estimate after observing a response.
 *
 * Step 1: Compute P(correct) under the model
 * Step 2: Apply Bayes' theorem to get P(mastered | observation)
 * Step 3: Apply learning transition: even if not mastered, there's a chance
 *         the student learned on this attempt.
 *
 * This is the core equation from Corbett & Anderson (1995).
 */
export function bktUpdate(
  params: BKTParams,
  correct: boolean
): BKTUpdateResult {
  const { pMastery, pTransit, pSlip, pGuess } = params;
  const wasMastered = pMastery >= MASTERY_THRESHOLD;

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

  // Apply learning transition:
  // P(L_new) = P(L | obs) + (1 - P(L | obs)) * P(T)
  const pMasteryNew =
    pMasteryGivenObs + (1 - pMasteryGivenObs) * pTransit;

  // Clamp to [0.001, 0.999] to avoid degenerate probabilities
  const clamped = Math.max(0.001, Math.min(0.999, pMasteryNew));

  return {
    pMastery: clamped,
    pCorrect: pObs,
    isMastered: clamped >= MASTERY_THRESHOLD,
    wasMastered,
  };
}

/**
 * Create default BKT params for a new student-KC pair.
 */
export function defaultBKTParams(): BKTParams {
  return {
    pMastery: DEFAULT_BKT_PARAMS.pInit,
    pInit: DEFAULT_BKT_PARAMS.pInit,
    pTransit: DEFAULT_BKT_PARAMS.pTransit,
    pSlip: DEFAULT_BKT_PARAMS.pSlip,
    pGuess: DEFAULT_BKT_PARAMS.pGuess,
  };
}

/**
 * Compute the model-predicted probability of a correct response
 * given current mastery and BKT params.
 */
export function predictCorrect(params: BKTParams): number {
  return (
    params.pMastery * (1 - params.pSlip) +
    (1 - params.pMastery) * params.pGuess
  );
}

/**
 * Estimate how many more practice opportunities are needed to reach mastery.
 * Simulates repeated correct responses from current state.
 * Returns Infinity if convergence unlikely (degenerate params).
 */
export function estimateToMastery(params: BKTParams, maxIter = 100): number {
  let p = params.pMastery;
  if (p >= MASTERY_THRESHOLD) return 0;

  for (let i = 1; i <= maxIter; i++) {
    // Simulate a correct response
    const pCorrect = p * (1 - params.pSlip) + (1 - p) * params.pGuess;
    const pGivenCorrect = (p * (1 - params.pSlip)) / pCorrect;
    p = pGivenCorrect + (1 - pGivenCorrect) * params.pTransit;
    if (p >= MASTERY_THRESHOLD) return i;
  }

  return Infinity;
}
