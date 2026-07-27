import { NextFunction, Request, Response } from "express";

import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "../../../../shared/infra/auth/session-token";

// Guards every route under /repos/* and GET /auth/me. Does NOT apply to
// /ingestion/action, /webhooks/github, or /internal/* — those authenticate
// via trigger credentials, not a user session.
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token: unknown = req.cookies?.[SESSION_COOKIE_NAME];

  if (typeof token !== "string" || token.length === 0) {
    res
      .status(401)
      .json({ error: { code: "not_authenticated", message: "Invalid or expired session" } });
    return;
  }

  try {
    const payload = verifySessionToken(token);
    req.userId = payload.userId;
    next();
  } catch {
    res
      .status(401)
      .json({ error: { code: "not_authenticated", message: "Invalid or expired session" } });
  }
}
