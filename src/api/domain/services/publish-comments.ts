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
// recorded and every comment is still attempted; it never throws out of
// this function, since one bad comment (closed PR, invalid line, revoked
// PAT) shouldn't block the rest from being published.
//
// Comments are published concurrently — idempotency is per-comment, not
// order-dependent, so there's no reason to wait on one before starting the
// next. `outcomes` keeps one slot per comment in its original array
// position, so picking the first defined entry always reflects the first
// comment in the list that failed, regardless of which network call
// happened to settle first.
export async function publishComments(
  params: PublishCommentsParams,
): Promise<PublishCommentsResult> {
  const outcomes = await Promise.all(
    params.comments.map(async (comment): Promise<string | undefined> => {
      if (comment.status !== "generated") {
        return undefined;
      }

      let errorMessage: string | undefined;
      try {
        const published = await params.scmAdapter.publishComment({
          repoFullName: params.repoFullName,
          prNumber: params.prNumber,
          commitSha: params.commitSha,
          file: comment.file,
          line: comment.line,
          endLine: comment.endLine,
          body: comment.body,
          suggestedCode: comment.suggestedCode,
        });
        comment.status = "published";
        comment.externalId = published.externalId;
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      await params.commentRepository.save(comment);
      return errorMessage;
    }),
  );

  const errorReason = outcomes.find((outcome): outcome is string => outcome !== undefined);
  return errorReason ? { errorReason } : {};
}
