import { Repo } from "../entities/repo.entity";
import { RepoRepository } from "../repository/repo.repository";

// Ownership check shared by every use case that operates on a specific
// repo (PATCH /repos/:id/config, and most features after it). A repo
// that doesn't exist and a repo that exists but belongs to someone else are
// treated identically (both return null): the caller should turn a null
// result into a 404, never a 403, so as to not confirm the resource's
// existence to a non-owner.
export async function assertRepoOwnership(
  repoRepository: RepoRepository,
  repoId: string,
  userId: string,
): Promise<Repo | null> {
  const repo = await repoRepository.findById(repoId);
  if (!repo || repo.userId !== userId) {
    return null;
  }
  return repo;
}
