-- CreateEnum
CREATE TYPE "CommentReplyStatus" AS ENUM ('queued', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "CommentReplyCategory" AS ENUM ('fix', 'clarification', 'disagreement', 'acknowledgment', 'other');

-- CreateTable
CREATE TABLE "comment_replies" (
    "id" VARCHAR(36) NOT NULL,
    "commentId" VARCHAR(36) NOT NULL,
    "humanExternalId" VARCHAR(50) NOT NULL,
    "humanBody" TEXT NOT NULL,
    "humanAuthor" VARCHAR(255) NOT NULL,
    "status" "CommentReplyStatus" NOT NULL,
    "category" "CommentReplyCategory",
    "errorReason" TEXT,
    "bellaBody" TEXT,
    "bellaSuggestedCode" TEXT,
    "bellaExternalId" VARCHAR(50),
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "reasoningTokens" INTEGER NOT NULL,
    "estimatedCost" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "comment_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "comment_replies_humanExternalId_key" ON "comment_replies"("humanExternalId");

-- AddForeignKey
ALTER TABLE "comment_replies" ADD CONSTRAINT "comment_replies_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
