import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { Repo } from "../../../domain/entities/repo.entity";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { GenerateActionTokenUseCase } from "./generate-action-token-use-case";
import { GenerateActionTokenController } from "./generate-action-token-controller";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("GenerateActionTokenController", () => {
  it("returns 404 when the repo isn't owned by the requesting user", async () => {
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(null);
    const useCase = new GenerateActionTokenUseCase(repoRepository, mock<CredentialRepository>());
    const controller = new GenerateActionTokenController(useCase);
    const req = { params: { id: "repo-1" }, userId: "user-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 200 with the plaintext token and a warning, never persisting it", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findByRepoIdAndType.mockResolvedValue(null);
    const useCase = new GenerateActionTokenUseCase(repoRepository, credentialRepository);
    const controller = new GenerateActionTokenController(useCase);
    const req = { params: { id: repo.id.value }, userId: "user-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.type).toBe("action_token");
    expect(body.token.length).toBeGreaterThan(0);
    expect(body.warning).toContain("cannot be retrieved again");

    const savedCredential = credentialRepository.save.mock.calls[0][0];
    expect(savedCredential.secretHash).not.toBe(body.token);
  });
});
