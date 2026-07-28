import { NextFunction, Request, Response } from "express";

import { config } from "../../../../config";
import { hash, verifyHash } from "../../../../shared/infra/crypto/hashing";

const BEARER_PREFIX = "Bearer ";

// Guards POST /internal/review-runs/:id/process — only QStash (forwarding
// the Authorization header set at publish time in ingest-action-use-case.ts)
// should ever reach this route. A plain function, not a factory, since this
// only ever compares against the one process-wide config value — unlike
// action-token-middleware, there's no per-repo lookup involved.
export function internalProcessMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith(BEARER_PREFIX)) {
    res.status(401).json({
      error: {
        code: "not_authenticated",
        message: "Invalid or missing internal process API key",
      },
    });
    return;
  }

  const token = header.slice(BEARER_PREFIX.length).trim();
  // Timing-safe: compare hashes instead of the raw strings directly.
  if (!token || !verifyHash(token, hash(config.INTERNAL_PROCESS_API_KEY))) {
    res.status(401).json({
      error: {
        code: "not_authenticated",
        message: "Invalid or missing internal process API key",
      },
    });
    return;
  }

  next();
}
