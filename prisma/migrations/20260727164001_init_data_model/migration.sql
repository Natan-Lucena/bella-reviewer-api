-- CreateEnum
CREATE TYPE "ScmProvider" AS ENUM ('github');

-- CreateEnum
CREATE TYPE "LlmProvider" AS ENUM ('gemini');

-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('llm', 'scm', 'action_token', 'webhook_secret');

-- CreateEnum
CREATE TYPE "CredentialProvider" AS ENUM ('gemini', 'github');

-- CreateEnum
CREATE TYPE "Trigger" AS ENUM ('action', 'webhook');

-- CreateEnum
CREATE TYPE "ReviewRunStatus" AS ENUM ('queued', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "TurnSource" AS ENUM ('agent', 'human', 'mixed');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('generated', 'published', 'discarded', 'outdated');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scmProvider" "ScmProvider" NOT NULL,
    "fullName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repo_configs" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "llmProvider" "LlmProvider" NOT NULL DEFAULT 'gemini',
    "model" TEXT NOT NULL,
    "tokenLimit" INTEGER NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "enabledCategories" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repo_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentials" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "type" "CredentialType" NOT NULL,
    "provider" "CredentialProvider" NOT NULL,
    "encryptedSecret" TEXT,
    "secretHash" TEXT,
    "scopes" TEXT,
    "lastValidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_runs" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "commitSha" TEXT NOT NULL,
    "trigger" "Trigger" NOT NULL,
    "status" "ReviewRunStatus" NOT NULL DEFAULT 'queued',
    "errorReason" TEXT,
    "totalInputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalReasoningTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DECIMAL(65,30),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_turns" (
    "id" TEXT NOT NULL,
    "reviewRunId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
    "source" "TurnSource" NOT NULL DEFAULT 'agent',
    "errorReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_turns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "reviewRunId" TEXT NOT NULL,
    "reviewTurnId" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "line" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "body" TEXT NOT NULL,
    "status" "CommentStatus" NOT NULL DEFAULT 'generated',
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "repo_configs_repoId_key" ON "repo_configs"("repoId");

-- CreateIndex
CREATE INDEX "credentials_secretHash_idx" ON "credentials"("secretHash");

-- CreateIndex
CREATE UNIQUE INDEX "credentials_repoId_type_key" ON "credentials"("repoId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "review_runs_repoId_commitSha_key" ON "review_runs"("repoId", "commitSha");

-- CreateIndex
CREATE INDEX "comments_reviewRunId_file_line_idx" ON "comments"("reviewRunId", "file", "line");

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
