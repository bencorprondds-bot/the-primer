/**
 * Shared types, constants, and validators for The Primer platform.
 */

// ─── Constants ───────────────────────────────────────────────

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

// ─── Types ───────────────────────────────────────────────────

export type UserRole = "STUDENT" | "PARENT" | "GUIDE" | "ADMIN";

export type Subject = "MATH" | "SCIENCE" | "ELA" | "SOCIAL_STUDIES";

export interface ProblemStep {
  id: string;
  prompt: string;
  correctAnswer: string;
  acceptableFormats?: string[];
  kcs: string[];
  hints: ProblemHint[];
}

export interface ProblemHint {
  type: "scaffold" | "more_specific" | "bottom_out";
  content: string;
}

export interface ProblemContent {
  id: string;
  title: string;
  difficulty: number;
  steps: ProblemStep[];
}

export interface PlaylistItem {
  id: string;
  type: "lesson" | "review" | "assessment";
  title: string;
  kcIds: string[];
  estimatedMinutes: number;
  status: "locked" | "available" | "in_progress" | "completed";
  masteryRequired: number;
}

export interface StudentStatus {
  studentId: string;
  name: string;
  status: "active" | "slowing" | "needs_help" | "idle" | "completed";
  currentKc?: string;
  consecutiveFailures: number;
  idleSeconds: number;
  inTutorSession: boolean;
}
