import { NextFunction, Request, Response } from "express";

import { hash } from "../../../../shared/infra/crypto/hashing";
import { CredentialRepository } from "../../../domain/repository/credential.repository";

const BEARER_PREFIX = "Bearer ";

function respondUnauthorized(res: Response): void {
  res
    .status(401)
    .json({ error: { code: "not_authenticated", message: "Invalid or missing action token" } });
}

// Guards POST /ingestion/action. Resolves repoId entirely from the
// BELLA_TOKEN — the caller never sends a repoId of its own. This is a
// factory (not a plain function like auth-middleware) because it needs a
// CredentialRepository to do the hash lookup.
export function createActionTokenMiddleware(credentialRepository: CredentialRepository) {
  return async function actionTokenMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const header = req.headers.authorization;
    if (!header || !header.startsWith(BEARER_PREFIX)) {
      return respondUnauthorized(res);
    }

    const token = header.slice(BEARER_PREFIX.length).trim();
    if (!token) {
      return respondUnauthorized(res);
    }

    const credential = await credentialRepository.findByHash(hash(token));
    if (!credential || credential.type !== "action_token") {
      return respondUnauthorized(res);
    }

    req.repoId = credential.repoId;
    next();
  };
}
