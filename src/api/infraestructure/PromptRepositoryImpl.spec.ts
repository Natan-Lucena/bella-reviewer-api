import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeepMockProxy, mockDeep, mockReset } from "vitest-mock-extended";

import type { PrismaClient } from "../../../generated/prisma";

vi.mock("../../shared/infra/database/relational/prisma-client", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { prisma } from "../../shared/infra/database/relational/prisma-client";
import { Prompt } from "../domain/entities/prompt.entity";
import { PromptRepositoryImpl } from "./PromptRepositoryImpl";

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});

describe("PromptRepositoryImpl", () => {
  const repository = new PromptRepositoryImpl();

  describe("save", () => {
    it("upserts by id, sending every field on create", async () => {
      const prompt = Prompt.create({
        userId: "user-1",
        name: "My prompt",
        content: "Focus on security issues.",
      });

      await repository.save(prompt);

      expect(prismaMock.prompt.upsert).toHaveBeenCalledWith({
        where: { id: prompt.id.value },
        create: {
          id: prompt.id.value,
          userId: prompt.userId,
          name: prompt.name,
          content: prompt.content,
          createdAt: prompt.createdAt,
          updatedAt: prompt.updatedAt,
        },
        update: {
          name: prompt.name,
          content: prompt.content,
          updatedAt: prompt.updatedAt,
        },
      });
    });

    it("persists a changed name, content, and updatedAt on an existing row (the update: branch, not just create:)", async () => {
      const prompt = Prompt.create({
        userId: "user-1",
        name: "Old name",
        content: "Old content",
      }).update({ name: "New name", content: "New content" });

      await repository.save(prompt);

      expect(prismaMock.prompt.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { name: "New name", content: "New content", updatedAt: prompt.updatedAt },
        }),
      );
    });
  });

  describe("findById", () => {
    it("returns the mapped prompt when found", async () => {
      prismaMock.prompt.findUnique.mockResolvedValue({
        id: "88888888-8888-8888-8888-888888888888",
        userId: "user-1",
        name: "My prompt",
        content: "Focus on security issues.",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      });

      const found = await repository.findById("88888888-8888-8888-8888-888888888888");

      expect(prismaMock.prompt.findUnique).toHaveBeenCalledWith({
        where: { id: "88888888-8888-8888-8888-888888888888" },
      });
      expect(found?.name).toBe("My prompt");
    });

    it("returns null when not found", async () => {
      prismaMock.prompt.findUnique.mockResolvedValue(null);

      expect(await repository.findById("missing-id")).toBeNull();
    });
  });

  describe("findByUserId", () => {
    it("returns the mapped list of prompts for the user", async () => {
      prismaMock.prompt.findMany.mockResolvedValue([
        {
          id: "88888888-8888-8888-8888-888888888888",
          userId: "user-1",
          name: "First prompt",
          content: "Content 1",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          id: "99999999-9999-9999-9999-999999999999",
          userId: "user-1",
          name: "Second prompt",
          content: "Content 2",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ]);

      const found = await repository.findByUserId("user-1");

      expect(prismaMock.prompt.findMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
      expect(found).toHaveLength(2);
      expect(found.map((p) => p.name)).toEqual(["First prompt", "Second prompt"]);
    });
  });

  describe("findByUserIdAndName", () => {
    it("returns the mapped prompt when a match exists", async () => {
      prismaMock.prompt.findFirst.mockResolvedValue({
        id: "88888888-8888-8888-8888-888888888888",
        userId: "user-1",
        name: "My prompt",
        content: "Focus on security issues.",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      });

      const found = await repository.findByUserIdAndName("user-1", "My prompt");

      expect(prismaMock.prompt.findFirst).toHaveBeenCalledWith({
        where: { userId: "user-1", name: "My prompt" },
      });
      expect(found?.id.value).toBe("88888888-8888-8888-8888-888888888888");
    });

    it("returns null when no match exists", async () => {
      prismaMock.prompt.findFirst.mockResolvedValue(null);

      expect(await repository.findByUserIdAndName("user-1", "Missing prompt")).toBeNull();
    });
  });

  describe("delete", () => {
    it("calls the Prisma delete by id", async () => {
      await repository.delete("88888888-8888-8888-8888-888888888888");

      expect(prismaMock.prompt.delete).toHaveBeenCalledWith({
        where: { id: "88888888-8888-8888-8888-888888888888" },
      });
    });
  });
});
