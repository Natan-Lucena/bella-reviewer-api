import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { User } from "../../../domain/entities/user.entity";
import { UserRepository } from "../../../domain/repository/user.repository";
import { GetCurrentUserUseCase } from "./get-current-user-use-case";

describe("GetCurrentUserUseCase", () => {
  it("returns the user for a valid id", async () => {
    const user = User.create({ email: "dev@example.com", passwordHash: "hash" });
    const userRepository = mock<UserRepository>();
    userRepository.findById.mockResolvedValue(user);
    const useCase = new GetCurrentUserUseCase(userRepository);

    const result = await useCase.execute(user.id.value);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBe("dev@example.com");
    }
  });

  it("fails with not_authenticated when the user no longer exists", async () => {
    const userRepository = mock<UserRepository>();
    userRepository.findById.mockResolvedValue(null);
    const useCase = new GetCurrentUserUseCase(userRepository);

    const result = await useCase.execute("11111111-1111-1111-1111-111111111111");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("not_authenticated");
    }
  });
});
