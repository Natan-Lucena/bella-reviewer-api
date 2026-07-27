import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { hash } from "../../../../shared/infra/crypto/hashing";
import { Credential } from "../../../domain/entities/credential.entity";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { createActionTokenMiddleware } from "./action-token-middleware";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("actionTokenMiddleware", () => {
  it("injects repoId and calls next() for a valid token", async () => {
    const credential = Credential.createActionToken({
      repoId: "repo-1",
      secretHash: hash("valid-token"),
    });
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findByHash.mockResolvedValue(credential);
    const middleware = createActionTokenMiddleware(credentialRepository);
    const req = { headers: { authorization: "Bearer valid-token" } } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    await middleware(req, res, next);

    expect(req.repoId).toBe("repo-1");
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects a missing Authorization header, without calling next()", async () => {
    const credentialRepository = mock<CredentialRepository>();
    const middleware = createActionTokenMiddleware(credentialRepository);
    const req = { headers: {} } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(credentialRepository.findByHash).not.toHaveBeenCalled();
  });

  it("rejects a malformed (non-Bearer) Authorization header", async () => {
    const credentialRepository = mock<CredentialRepository>();
    const middleware = createActionTokenMiddleware(credentialRepository);
    const req = { headers: { authorization: "Basic abc123" } } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a token that doesn't match any credential", async () => {
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findByHash.mockResolvedValue(null);
    const middleware = createActionTokenMiddleware(credentialRepository);
    const req = { headers: { authorization: "Bearer unknown-token" } } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a hash match that belongs to a different credential type", async () => {
    const otherCredential = Credential.createWebhookSecret({
      repoId: "repo-1",
      encryptedSecret: "cipher-text",
    });
    const credentialRepository = mock<CredentialRepository>();
    // Not realistic (findByHash is only ever populated for action_token rows),
    // but guards the middleware's own defensive type check regardless.
    credentialRepository.findByHash.mockResolvedValue(otherCredential);
    const middleware = createActionTokenMiddleware(credentialRepository);
    const req = { headers: { authorization: "Bearer some-token" } } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
