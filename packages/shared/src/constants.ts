/**
 * Shared constants for The Primer platform.
 *
 * Extracted to avoid circular dependencies — bkt.ts needs these
 * but index.ts re-exports from bkt.ts.
 */

/** BKT mastery threshold. When P(L) >= this, the KC is considered mastered. */
export const MASTERY_THRESHOLD = 0.95;

/** Default BKT parameters for new students. */
export const DEFAULT_BKT_PARAMS = {
  pInit: 0.1,
  pTransit: 0.2,
  pSlip: 0.1,
  pGuess: 0.25,
} as const;

/** FSRS target retention probability. */
export const TARGET_RETENTION = 0.9;

/** Maximum AI tutor conversation turns per problem. */
export const MAX_TUTOR_TURNS = 15;

/** Engagement idle thresholds in seconds. */
export const IDLE_THRESHOLDS = {
  potentiallyIdle: 30,
  idle: 120,
  sessionTimeout: 300,
} as const;
