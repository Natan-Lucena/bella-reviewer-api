import { createHmac } from "node:crypto";

import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { encrypt } from "../../../../shared/infra/crypto/encryption";
import { Credential } from "../../../domain/entities/credential.entity";
import { Repo } from "../../../domain/entities/repo.entity";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { createWebhookSignatureMiddleware } from "./webhook-signature-middleware";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function sign(body: Buffer, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("webhookSignatureMiddleware", () => {
  it("resolves repoId and calls next() for a validly signed payload", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const secret = "webhook-secret";
    const body = Buffer.from(JSON.stringify({ repository: { full_name: "org/repo" } }));

    const repoRepository = mock<RepoRepository>();
    repoRepository.findByFullName.mockResolvedValue(repo);
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findByRepoIdAndType.mockResolvedValue(
      Credential.createWebhookSecret({ repoId: repo.id.value, encryptedSecret: encrypt(secret) }),
    );

    const middleware = createWebhookSignatureMiddleware(repoRepository, credentialRepository);
    const req = {
      body,
      headers: { "x-hub-signature-256": sign(body, secret) },
    } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    await middleware(req, res, next);

    expect(req.repoId).toBe(repo.id.value);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 400 when the body isn't valid JSON", async () => {
    const middleware = createWebhookSignatureMiddleware(
      mock<RepoRepository>(),
      mock<CredentialRepository>(),
    );
    const req = { body: Buffer.from("not json"), headers: {} } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 404 without leaking info when no repo matches the full_name", async () => {
    const repoRepository = mock<RepoRepository>();
    repoRepository.findByFullName.mockResolvedValue(null);
    const middleware = createWebhookSignatureMiddleware(
      repoRepository,
      mock<CredentialRepository>(),
    );
    const body = Buffer.from(JSON.stringify({ repository: { full_name: "org/unknown" } }));
    const req = { body, headers: {} } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 404 when the repo has no webhook_secret configured", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findByFullName.mockResolvedValue(repo);
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findByRepoIdAndType.mockResolvedValue(null);
    const middleware = createWebhookSignatureMiddleware(repoRepository, credentialRepository);
    const body = Buffer.from(JSON.stringify({ repository: { full_name: "org/repo" } }));
    const req = { body, headers: {} } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 for an invalid signature, before any use-case logic runs", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findByFullName.mockResolvedValue(repo);
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findByRepoIdAndType.mockResolvedValue(
      Credential.createWebhookSecret({
        repoId: repo.id.value,
        encryptedSecret: encrypt("real-secret"),
      }),
    );
    const middleware = createWebhookSignatureMiddleware(repoRepository, credentialRepository);
    const body = Buffer.from(JSON.stringify({ repository: { full_name: "org/repo" } }));
    const req = {
      body,
      headers: { "x-hub-signature-256": sign(body, "wrong-secret") },
    } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when the signature header is missing", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findByFullName.mockResolvedValue(repo);
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findByRepoIdAndType.mockResolvedValue(
      Credential.createWebhookSecret({
        repoId: repo.id.value,
        encryptedSecret: encrypt("real-secret"),
      }),
    );
    const middleware = createWebhookSignatureMiddleware(repoRepository, credentialRepository);
    const body = Buffer.from(JSON.stringify({ repository: { full_name: "org/repo" } }));
    const req = { body, headers: {} } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
