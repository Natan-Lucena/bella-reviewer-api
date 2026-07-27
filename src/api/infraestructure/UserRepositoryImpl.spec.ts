import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeepMockProxy, mockDeep, mockReset } from "vitest-mock-extended";

import type { PrismaClient } from "../../../generated/prisma";

vi.mock("../../shared/infra/database/relational/prisma-client", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { prisma } from "../../shared/infra/database/relational/prisma-client";
import { User } from "../domain/entities/user.entity";
import { UserRepositoryImpl } from "./UserRepositoryImpl";

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});

describe("UserRepositoryImpl", () => {
  const repository = new UserRepositoryImpl();

  describe("save", () => {
    it("upserts by id with the entity's fields", async () => {
      const user = User.create({ email: "dev@example.com", passwordHash: "hash" });

      await repository.save(user);

      expect(prismaMock.user.upsert).toHaveBeenCalledWith({
        where: { id: user.id },
        create: {
          id: user.id,
          email: user.email,
          passwordHash: user.passwordHash,
          createdAt: user.createdAt,
        },
        update: {
          email: user.email,
          passwordHash: user.passwordHash,
        },
      });
    });
  });

  describe("findById", () => {
    it("maps the persisted row to a User entity", async () => {
      const row = {
        id: "user-1",
        email: "dev@example.com",
        passwordHash: "hash",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      };
      prismaMock.user.findUnique.mockResolvedValue(row);

      const found = await repository.findById("user-1");

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { id: "user-1" } });
      expect(found?.id).toBe("user-1");
      expect(found?.email).toBe("dev@example.com");
    });

    it("returns null when no row is found", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const found = await repository.findById("missing");

      expect(found).toBeNull();
    });
  });

  describe("findByEmail", () => {
    it("looks up by email and maps the result", async () => {
      const row = {
        id: "user-1",
        email: "dev@example.com",
        passwordHash: "hash",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      };
      prismaMock.user.findUnique.mockResolvedValue(row);

      const found = await repository.findByEmail("dev@example.com");

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: "dev@example.com" },
      });
      expect(found?.id).toBe("user-1");
    });

    it("returns null when the email isn't registered", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const found = await repository.findByEmail("nobody@example.com");

      expect(found).toBeNull();
    });
  });
});
