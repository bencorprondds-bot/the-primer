/**
 * Shared types for the Agentic Primer API.
 */

import type { Agent } from "./generated/prisma/index.js";

/**
 * Hono environment type — declares variables set by middleware.
 */
export type AppEnv = {
  Variables: {
    agent: Agent;
  };
};
