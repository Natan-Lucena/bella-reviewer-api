-- AlterTable
ALTER TABLE "comments" ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "createdAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "credentials" ALTER COLUMN "createdAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "repo_configs" ALTER COLUMN "llmProvider" DROP DEFAULT,
ALTER COLUMN "temperature" DROP DEFAULT,
ALTER COLUMN "enabledCategories" DROP DEFAULT,
ALTER COLUMN "createdAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "repos" ALTER COLUMN "active" DROP DEFAULT,
ALTER COLUMN "createdAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "review_runs" ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "totalInputTokens" DROP DEFAULT,
ALTER COLUMN "totalOutputTokens" DROP DEFAULT,
ALTER COLUMN "totalReasoningTokens" DROP DEFAULT,
ALTER COLUMN "createdAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "review_turns" ALTER COLUMN "inputTokens" DROP DEFAULT,
ALTER COLUMN "outputTokens" DROP DEFAULT,
ALTER COLUMN "reasoningTokens" DROP DEFAULT,
ALTER COLUMN "source" DROP DEFAULT,
ALTER COLUMN "createdAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "createdAt" DROP DEFAULT;
