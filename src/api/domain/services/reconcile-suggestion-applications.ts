import { CommentApplyEvent, CommentApplyEventStatus } from "../entities/comment-apply-event.entity";
import { CommentApplyEventRepository } from "../repository/comment-apply-event.repository";
import { CommentRepository } from "../repository/comment.repository";
import { ScmAdapterPort } from "../ports/scm-adapter.port";
import { relocateSuggestionLine } from "./relocate-suggestion-line";

export type ReconcileSuggestionApplicationsParams = {
  scmAdapter: ScmAdapterPort;
  commentRepository: CommentRepository;
  commentApplyEventRepository: CommentApplyEventRepository;
  repoFullName: string;
  repoId: string;
  prNumber: number;
  previousCommitSha: string;
  newCommitSha: string;
};

// Reconciles every actionable suggestion still pending for a PR against what
// actually changed in the latest push — one compareCommits call shared
// across all of them, never one API call per comment. Mirrors
// publish-comments.ts's style: this does IO via the ports it's handed, but
// lives in domain/services/ because it orchestrates a central business rule,
// not an infrastructure detail.
export async function reconcileSuggestionApplications(
  params: ReconcileSuggestionApplicationsParams,
): Promise<void> {
  const pending = await params.commentRepository.findPendingSuggestionsByRepoIdAndPrNumber(
    params.repoId,
    params.prNumber,
  );
  if (pending.length === 0) {
    return;
  }

  const comparison = await params.scmAdapter.compareCommits({
    repoFullName: params.repoFullName,
    base: params.previousCommitSha,
    head: params.newCommitSha,
  });

  for (const comment of pending) {
    if (!comparison.changedFiles.includes(comment.file)) {
      // This push never touched the file — no signal either way.
      continue;
    }

    const content = await params.scmAdapter.getFileContent({
      repoFullName: params.repoFullName,
      ref: params.newCommitSha,
      path: comment.file,
    });

    let outcome: { status: CommentApplyEventStatus; detectionMethod: string } | null = null;

    if (content === null) {
      outcome = { status: "superseded", detectionMethod: "file_deleted" };
    } else {
      const lines = content.split("\n");
      // Relocates via contextBefore/contextAfter when available (DT-01) —
      // an unrelated edit above comment.line, in the same file, between the
      // commit the suggestion was published on and this one, shifts every
      // line below it; reading comment.line directly would silently compare
      // the wrong line. Returns null when drift happened but couldn't be
      // relocated with confidence — treated the same as a plain mismatch
      // below (stays pending, no outcome), never guessed.
      const relocatedIndex = relocateSuggestionLine(lines, {
        line: comment.line,
        contextBefore: comment.contextBefore,
        contextAfter: comment.contextAfter,
      });

      if (relocatedIndex !== null) {
        if (relocatedIndex >= lines.length) {
          outcome = { status: "superseded", detectionMethod: "line_out_of_range" };
        } else {
          // Minimal, deliberately conservative normalization: only trim the
          // ends. Reducing false positives matters more than reducing false
          // negatives here — see reconcile-suggestion-applications.spec.ts.
          const actualLine = (lines[relocatedIndex] ?? "").trim();
          const expectedLine = (comment.suggestedCode ?? "").trim();
          if (actualLine === expectedLine) {
            const relocated = relocatedIndex !== comment.line - 1;
            outcome = {
              status: "applied_manual",
              detectionMethod: relocated ? "content_match_relocated" : "content_match",
            };
          }
        }
      }
    }

    if (!outcome) {
      continue; // still pending — no transition, no event.
    }

    const updated = comment.markApplyStatus(outcome.status, {
      commitSha: params.newCommitSha,
      detectionMethod: outcome.detectionMethod,
    });
    await params.commentRepository.save(updated);
    await params.commentApplyEventRepository.save(
      CommentApplyEvent.create({
        commentId: updated.id.value,
        newStatus: outcome.status,
        commitSha: params.newCommitSha,
        detectionMethod: outcome.detectionMethod,
      }),
    );
  }
}
