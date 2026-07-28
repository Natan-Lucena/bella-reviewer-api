-- DropForeignKey
ALTER TABLE "comments" DROP CONSTRAINT "comments_reviewRunId_fkey";

-- DropForeignKey
ALTER TABLE "comments" DROP CONSTRAINT "comments_reviewTurnId_fkey";

-- DropForeignKey
ALTER TABLE "credentials" DROP CONSTRAINT "credentials_repoId_fkey";

-- DropForeignKey
ALTER TABLE "repo_configs" DROP CONSTRAINT "repo_configs_repoId_fkey";

-- DropForeignKey
ALTER TABLE "repos" DROP CONSTRAINT "repos_userId_fkey";

-- DropForeignKey
ALTER TABLE "review_runs" DROP CONSTRAINT "review_runs_repoId_fkey";

-- DropForeignKey
ALTER TABLE "review_turns" DROP CONSTRAINT "review_turns_reviewRunId_fkey";

-- AlterTable
ALTER TABLE "comments" DROP CONSTRAINT "comments_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(36),
ALTER COLUMN "reviewRunId" SET DATA TYPE VARCHAR(36),
ALTER COLUMN "reviewTurnId" SET DATA TYPE VARCHAR(36),
ALTER COLUMN "file" SET DATA TYPE VARCHAR(1024),
ALTER COLUMN "category" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "externalId" SET DATA TYPE VARCHAR(50),
ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "credentials" DROP CONSTRAINT "credentials_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(36),
ALTER COLUMN "repoId" SET DATA TYPE VARCHAR(36),
ALTER COLUMN "encryptedSecret" SET DATA TYPE VARCHAR(1000),
ALTER COLUMN "secretHash" SET DATA TYPE VARCHAR(64),
ALTER COLUMN "scopes" SET DATA TYPE VARCHAR(255),
ADD CONSTRAINT "credentials_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "repo_configs" DROP CONSTRAINT "repo_configs_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(36),
ALTER COLUMN "repoId" SET DATA TYPE VARCHAR(36),
ALTER COLUMN "model" SET DATA TYPE VARCHAR(100),
ADD CONSTRAINT "repo_configs_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "repos" DROP CONSTRAINT "repos_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(36),
ALTER COLUMN "userId" SET DATA TYPE VARCHAR(36),
ALTER COLUMN "fullName" SET DATA TYPE VARCHAR(255),
ADD CONSTRAINT "repos_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "review_runs" DROP CONSTRAINT "review_runs_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(36),
ALTER COLUMN "repoId" SET DATA TYPE VARCHAR(36),
ALTER COLUMN "commitSha" SET DATA TYPE VARCHAR(40),
ADD CONSTRAINT "review_runs_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "review_turns" DROP CONSTRAINT "review_turns_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(36),
ALTER COLUMN "reviewRunId" SET DATA TYPE VARCHAR(36),
ADD CONSTRAINT "review_turns_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "users" DROP CONSTRAINT "users_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(36),
ALTER COLUMN "email" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "passwordHash" SET DATA TYPE VARCHAR(100),
ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

-- AddForeignKey
ALTER TABLE "repos" ADD CONSTRAINT "repos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_configs" ADD CONSTRAINT "repo_configs_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "repos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "repos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_runs" ADD CONSTRAINT "review_runs_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "repos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_turns" ADD CONSTRAINT "review_turns_reviewRunId_fkey" FOREIGN KEY ("reviewRunId") REFERENCES "review_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_reviewRunId_fkey" FOREIGN KEY ("reviewRunId") REFERENCES "review_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_reviewTurnId_fkey" FOREIGN KEY ("reviewTurnId") REFERENCES "review_turns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
