-- AlterTable
ALTER TABLE "comment_replies" ADD COLUMN     "llmProvider" "LlmProvider",
ADD COLUMN     "model" TEXT;

-- AlterTable
ALTER TABLE "review_runs" ADD COLUMN     "llmProvider" "LlmProvider",
ADD COLUMN     "model" TEXT;
