import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { agentRoutes } from "./routes/agents.js";
import { courseRoutes } from "./routes/courses.js";
import { taskRoutes } from "./routes/tasks.js";
import { assessRoutes } from "./routes/assess.js";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Health check
app.get("/", (c) => c.json({
  name: "The Agentic Primer",
  version: "0.3.0",
  status: "operational"
}));

// Routes
app.route("/agents", agentRoutes);
app.route("/courses", courseRoutes);
app.route("/tasks", taskRoutes);
app.route("/assess", assessRoutes);

// Start
const port = Number(process.env.PORT) || 3002;
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🎓 Agentic Primer running on http://localhost:${info.port}`);
});

export default app;
