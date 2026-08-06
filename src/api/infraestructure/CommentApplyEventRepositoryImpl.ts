import { prisma } from "../../shared/infra/database/relational/prisma-client";
import {
  CommentApplyEvent,
  CommentApplyEventStatus,
} from "../domain/entities/comment-apply-event.entity";
import { CommentApplyEventRepository } from "../domain/repository/comment-apply-event.repository";

export class CommentApplyEventRepositoryImpl implements CommentApplyEventRepository {
  // A plain create, not the upsert() pattern used by the other
  // *RepositoryImpl classes — CommentApplyEvent has no transition method
  // (see the entity), so there is no legitimate update path to support.
  async save(event: CommentApplyEvent): Promise<void> {
    await prisma.commentApplyEvent.create({
      data: {
        id: event.id.value,
        commentId: event.commentId,
        newStatus: event.newStatus,
        commitSha: event.commitSha,
        detectionMethod: event.detectionMethod,
        createdAt: event.createdAt,
      },
    });
  }

  async findByCommentId(commentId: string): Promise<CommentApplyEvent[]> {
    const rows = await prisma.commentApplyEvent.findMany({
      where: { commentId },
      orderBy: { createdAt: "asc" },
    });
    // Prisma's generated column type is the full ApplyStatus (Postgres has
    // no notion of the narrower "never pending" domain rule) — safe to
    // narrow here since every row was written through
    // CommentApplyEvent.create(), whose own type never allows "pending".
    return rows.map((row) =>
      CommentApplyEvent.fromPersistence({
        ...row,
        newStatus: row.newStatus as CommentApplyEventStatus,
      }),
    );
  }
}
