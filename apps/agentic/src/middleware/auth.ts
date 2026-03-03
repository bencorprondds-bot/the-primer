import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { db } from "../lib/db.js";
import crypto from "node:crypto";
import type { AppEnv } from "../types.js";

/**
 * API key authentication middleware.
 * Expects: Authorization: Bearer <api-key>
 * Sets c.set("agent", agent) on success.
 */
export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing or invalid Authorization header" });
  }

  const apiKey = authHeader.slice(7);
  const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

  const agent = await db.agent.findUnique({
    where: { apiKeyHash: keyHash },
  });

  if (!agent) {
    throw new HTTPException(401, { message: "Invalid API key" });
  }

  c.set("agent", agent);
  await next();
});
