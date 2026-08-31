-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "inputTokens" INTEGER,
ADD COLUMN     "outputTokens" INTEGER,
ADD COLUMN     "reasoningTokens" INTEGER,
ADD COLUMN     "estimatedCost" DECIMAL(65,30);

-- Backfill: the LLM's original response text for an already-generated
-- comment was never persisted, so there is no way to retroactively compute
-- its attributed cost. 0 is the correct value for the three token columns
-- (nothing left to attribute), and estimatedCost stays null (unknown, not
-- free) — same distinction ReviewRun.estimatedCost already makes.
UPDATE "comments" SET "inputTokens" = 0, "outputTokens" = 0, "reasoningTokens" = 0 WHERE "inputTokens" IS NULL;

-- Now that every row has a value, the three token columns can become
-- mandatory. Same migration, not a follow-up one — never leave a window
-- where the Prisma Client validates them as required while the database
-- still allows null. estimatedCost stays nullable (Comment.estimatedCost is
-- number | null, same as ReviewRun.estimatedCost).
ALTER TABLE "comments" ALTER COLUMN "inputTokens" SET NOT NULL,
ALTER COLUMN "outputTokens" SET NOT NULL,
ALTER COLUMN "reasoningTokens" SET NOT NULL;
