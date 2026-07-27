import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { Repo } from "../entities/repo.entity";
import { RepoRepository } from "../repository/repo.repository";
import { assertRepoOwnership } from "./assert-repo-ownership";

describe("assertRepoOwnership", () => {
  it("returns the repo when it exists and belongs to the user", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);

    const result = await assertRepoOwnership(repoRepository, repo.id.value, "user-1");

    expect(result).toBe(repo);
  });

  it("returns null when the repo doesn't exist", async () => {
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(null);

    const result = await assertRepoOwnership(repoRepository, "missing-id", "user-1");

    expect(result).toBeNull();
  });

  it("returns null when the repo belongs to a different user", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);

    const result = await assertRepoOwnership(repoRepository, repo.id.value, "user-2");

    expect(result).toBeNull();
  });
});
