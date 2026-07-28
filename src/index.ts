import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

import { AuthRouter } from "./api/application/container/routes/auth-router";
import { IngestionRouter } from "./api/application/container/routes/ingestion-router";
import { InternalRouter } from "./api/application/container/routes/internal-router";
import { RepoRouter } from "./api/application/container/routes/repo-router";
import { WebhookRouter } from "./api/application/container/routes/webhook-router";
import { config } from "./config";
import { logger } from "./logger";

const app = express();

app.use(
  cors({
    origin: config.FRONTEND_ORIGIN,
    credentials: true, // session via httpOnly cookie
  }),
);

// Mounted BEFORE the global express.json() below: POST /webhooks/github
// needs the RAW request body to recompute the signature HMAC (see
// webhook-router.ts, which applies express.raw() itself, scoped to that
// one route) — by the time express.json() would run, the bytes needed for
// the signature would already be gone.
app.use("/webhooks", new WebhookRouter().router);

app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/auth", new AuthRouter().router);
app.use("/repos", new RepoRouter().router);
app.use("/ingestion", new IngestionRouter().router);
app.use("/internal", new InternalRouter().router);

app.use((_req, res) => {
  res.status(404).json({ error: { code: "route_not_found", message: "Route not found" } });
});

app.listen(config.PORT, () => {
  logger.info(`Server started on port ${config.PORT}`);
});
