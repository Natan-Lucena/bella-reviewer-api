import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

import { AuthRouter } from "./api/application/container/routes/auth-router";
import { IngestionRouter } from "./api/application/container/routes/ingestion-router";
import { InternalRouter } from "./api/application/container/routes/internal-router";
import { RepoRouter } from "./api/application/container/routes/repo-router";
import { WebhookRouter } from "./api/application/container/routes/webhook-router";
import { logger } from "./logger";
import { prisma } from "./shared/infra/database/relational/prisma-client";

// Builds the Express app without starting a listener. Two callers use
// this: src/index.ts (traditional long-running process, calls .listen())
// and api/index.ts (Vercel serverless function, invokes the app directly
// per-request — there's never a socket to listen on in that context).
export function createApp(): express.Express {
  const app = express();

  app.use(
    cors({
      // TEMPORARY: no frontend exists yet, so there's no real origin to
      // restrict to. `origin: true` reflects whatever Origin the caller
      // sent — not the same as `origin: "*"`, which browsers reject
      // outright when combined with `credentials: true` (this project's
      // cookie-based session needs credentials). Switch back to
      // `config.FRONTEND_ORIGIN` once a real frontend origin exists.
      origin: true,
      credentials: true, // session via httpOnly cookie
    }),
  );

  // Mounted BEFORE the global express.json() below: POST /webhooks/github
  // needs the RAW request body to recompute the signature HMAC (see
  // webhook-router.ts, which applies express.raw() itself, scoped to that
  // one route) — by the time express.json() would run, the bytes needed for
  // the signature would already be gone.
  app.use("/webhooks", new WebhookRouter().router);

  // Express's own default body limit is 100kb — comfortably exceeded by a real
  // Pull Request diff (POST /ingestion/action carries the whole diff; a large
  // dependency lockfile or a big initial commit routinely blows past 100kb).
  // 15mb is generous relative to any diff still worth reviewing, while staying
  // under Vercel's own request body ceiling.
  app.use(express.json({ limit: "15mb" }));
  app.use(cookieParser());

  // Both are pinged by Vercel's own deployment health check, in addition to
  // whatever monitoring hits /health directly — root gets a cheap liveness
  // check (no DB round-trip) so the platform check never fails on a slow
  // database, while /health does the real readiness check.
  app.get("/", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/health", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: "ok", database: "ok" });
    } catch (error) {
      logger.error("Health check: database unreachable", { message: (error as Error).message });
      res.status(503).json({ status: "error", database: "unreachable" });
    }
  });

  app.use("/auth", new AuthRouter().router);
  app.use("/repos", new RepoRouter().router);
  app.use("/ingestion", new IngestionRouter().router);
  app.use("/internal", new InternalRouter().router);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "route_not_found", message: "Route not found" } });
  });

  return app;
}

// Vercel's Node.js builder traces this file as a dependency of api/index.ts
// (a relative import reaching outside api/) and, for some request paths,
// invokes it directly as if it were its own Serverless Function entry —
// observed in production as a crash ("Invalid export found ... default
// export must be a function or server") specifically on GET /. A default
// export here is a cheap defensive fix regardless of the exact platform
// mechanism: if this module ever gets invoked directly, there's now a
// working Express app to handle the request instead of a crash. api/index.ts
// re-exports this same instance rather than calling createApp() again.
export default createApp();
