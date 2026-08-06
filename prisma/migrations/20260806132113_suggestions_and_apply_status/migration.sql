-- CreateEnum
CREATE TYPE "CommentKind" AS ENUM ('actionable', 'observation');

-- CreateEnum
CREATE TYPE "ApplyStatus" AS ENUM ('pending', 'applied_button', 'applied_manual', 'not_applied', 'superseded', 'dismissed');

-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "appliedAt" TIMESTAMP(3),
ADD COLUMN     "appliedAtCommit" VARCHAR(40),
ADD COLUMN     "applyStatus" "ApplyStatus",
ADD COLUMN     "detectionMethod" VARCHAR(100),
ADD COLUMN     "kind" "CommentKind",
ADD COLUMN     "suggestedCode" TEXT;

-- Backfill: no comment published before this migration was ever a
-- suggestion — the concept didn't exist yet, so "observation" is the
-- factually correct value for every existing row, not a guess.
UPDATE "comments" SET "kind" = 'observation' WHERE "kind" IS NULL;

-- Now that every row has a value, kind can become mandatory. Same migration,
-- not a follow-up one — never leave a window where the Prisma Client
-- validates kind as required while the database still allows null.
ALTER TABLE "comments" ALTER COLUMN "kind" SET NOT NULL;

-- CreateTable
CREATE TABLE "comment_apply_events" (
    "id" VARCHAR(36) NOT NULL,
    "commentId" VARCHAR(36) NOT NULL,
    "newStatus" "ApplyStatus" NOT NULL,
    "commitSha" VARCHAR(40),
    "detectionMethod" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comment_apply_events_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "comment_apply_events" ADD CONSTRAINT "comment_apply_events_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
