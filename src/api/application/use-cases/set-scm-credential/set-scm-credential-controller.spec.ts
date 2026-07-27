import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { Repo } from "../../../domain/entities/repo.entity";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { SetScmCredentialUseCase } from "./set-scm-credential-use-case";
import { SetScmCredentialController } from "./set-scm-credential-controller";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("SetScmCredentialController", () => {
  it("returns 400 when pat is missing", async () => {
    const useCase = new SetScmCredentialUseCase(
      mock<RepoRepository>(),
      mock<CredentialRepository>(),
    );
    const controller = new SetScmCredentialController(useCase);
    const req = {
      body: {},
      params: { id: "repo-1" },
      userId: "user-1",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "validation_error" }) }),
    );
  });

  it("returns 404 when the repo isn't owned by the requesting user", async () => {
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(null);
    const useCase = new SetScmCredentialUseCase(repoRepository, mock<CredentialRepository>());
    const controller = new SetScmCredentialController(useCase);
    const req = {
      body: { pat: "ghp_token" },
      params: { id: "repo-1" },
      userId: "user-1",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 200 with the credential status on success, never the pat", async () => {
    const repoRepository = mock<RepoRepository>();
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findByRepoIdAndType.mockResolvedValue(null);
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    repoRepository.findById.mockResolvedValue(repo);
    const useCase = new SetScmCredentialUseCase(repoRepository, credentialRepository);
    const controller = new SetScmCredentialController(useCase);
    const req = {
      body: { pat: "ghp_token" },
      params: { id: repo.id.value },
      userId: "user-1",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body).toEqual(
      expect.objectContaining({ type: "scm", provider: "github", configured: true }),
    );
    expect(body.pat).toBeUndefined();
    expect(body.encryptedSecret).toBeUndefined();
  });
});
