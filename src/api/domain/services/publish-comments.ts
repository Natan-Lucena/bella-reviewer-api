import type { Comment } from "../entities/comment.entity";
import type { ScmAdapterPort } from "../ports/scm-adapter.port";
import type { CommentRepository } from "../repository/comment.repository";

export type PublishCommentsParams = {
  scmAdapter: ScmAdapterPort;
  commentRepository: CommentRepository;
  repoFullName: string;
  prNumber: number;
  commitSha: string;
  comments: Comment[];
};

export type PublishCommentsResult = {
  errorReason?: string;
};

// Publishes each comment still `generated`, persisting the outcome as it
// goes — so a second call over the same (freshly reloaded) comments only
// retries the ones that never made it to `published`. A publish failure is
// recorded and the loop continues; it never throws out of this function,
// since one bad comment (closed PR, invalid line, revoked PAT) shouldn't
// block the rest from being published.
export async function publishComments(
  params: PublishCommentsParams,
): Promise<PublishCommentsResult> {
  let errorReason: string | undefined;

  for (const comment of params.comments) {
    if (comment.status !== "generated") {
      continue;
    }

    try {
      const published = await params.scmAdapter.publishComment({
        repoFullName: params.repoFullName,
        prNumber: params.prNumber,
        commitSha: params.commitSha,
        file: comment.file,
        line: comment.line,
        body: comment.body,
      });
      comment.status = "published";
      comment.externalId = published.externalId;
    } catch (error) {
      errorReason ??= error instanceof Error ? error.message : String(error);
    }

    await params.commentRepository.save(comment);
  }

  return errorReason ? { errorReason } : {};
}
