import cors from "cors";
import express from "express";

import { config } from "./config";
import { logger } from "./logger";

const app = express();

app.use(
  cors({
    origin: config.FRONTEND_ORIGIN,
    credentials: true, // session via httpOnly cookie — see backend-prds/02-auth-cadastro-login-sessao.md
  }),
);

// NOTE for whoever implements backend-prds/09-ingestao-webhook.md: the
// POST /webhooks/github route needs the RAW request body (not parsed) to
// correctly recompute the signature HMAC. It should use
// express.raw({ type: "application/json" }) only on that route, mounted
// BEFORE this global express.json() — or this parser needs to be scoped to
// the other routes (per-route express.json(), not global) once that route
// is added.
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Business routes (auth, repos, ingestion, webhooks, internal) are added
// here as each PRD from ../../backend-prds/ gets implemented, registered
// via src/api/application/container/routes/.

app.use((_req, res) => {
  res.status(404).json({ error: { code: "route_not_found", message: "Route not found" } });
});

app.listen(config.PORT, () => {
  logger.info(`Server started on port ${config.PORT}`);
});
