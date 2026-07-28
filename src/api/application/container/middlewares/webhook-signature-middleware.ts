import { NextFunction, Request, Response } from "express";

import { decrypt } from "../../../../shared/infra/crypto/encryption";
import { verifyGithubWebhookSignature } from "../../../domain/services/verify-github-webhook-signature";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";

const SIGNATURE_HEADER = "x-hub-signature-256";

function respondNotConfigured(res: Response): void {
  res.status(404).json({ error: { code: "repo_not_found", message: "Repository not configured" } });
}

function respondUnauthorized(res: Response): void {
  res
    .status(401)
    .json({ error: { code: "invalid_signature", message: "Invalid webhook signature" } });
}

// Guards POST /webhooks/github. The repo can't be identified by the
// signature alone (unlike the BELLA_TOKEN, which resolves a repo by hash on
// its own) — GitHub's payload carries repository.full_name in the body, so
// the repo has to be looked up *before* the signature can even be checked,
// since the signature is verified against that same repo's own secret.
// This route is mounted with express.raw() (see webhook-router.ts), so
// req.body here is a Buffer, not a parsed object — that's required: HMAC
// verification needs the exact bytes GitHub sent, not a re-serialization.
export function createWebhookSignatureMiddleware(
  repoRepository: RepoRepository,
  credentialRepository: CredentialRepository,
) {
  return async function webhookSignatureMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const rawBody = req.body as Buffer;

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      res.status(400).json({ error: { code: "invalid_payload", message: "Malformed JSON body" } });
      return;
    }

    const fullName = (payload as { repository?: { full_name?: unknown } })?.repository?.full_name;
    if (typeof fullName !== "string") {
      res
        .status(400)
        .json({ error: { code: "invalid_payload", message: "Missing repository.full_name" } });
      return;
    }

    const repo = await repoRepository.findByFullName(fullName);
    if (!repo) {
      return respondNotConfigured(res);
    }

    const webhookSecretCredential = await credentialRepository.findByRepoIdAndType(
      repo.id.value,
      "webhook_secret",
    );
    if (!webhookSecretCredential?.encryptedSecret) {
      return respondNotConfigured(res);
    }

    const signatureHeader = req.headers[SIGNATURE_HEADER];
    const secret = decrypt(webhookSecretCredential.encryptedSecret);
    if (
      typeof signatureHeader !== "string" ||
      !verifyGithubWebhookSignature(rawBody, secret, signatureHeader)
    ) {
      return respondUnauthorized(res);
    }

    req.repoId = repo.id.value;
    next();
  };
}
