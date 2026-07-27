import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { User } from "../../../domain/entities/user.entity";
import { UserRepository } from "../../../domain/repository/user.repository";
import { SignupUserUseCase } from "./signup-user-use-case";

describe("SignupUserUseCase", () => {
  it("creates a new user when the email isn't registered yet", async () => {
    const userRepository = mock<UserRepository>();
    userRepository.findByEmail.mockResolvedValue(null);
    const useCase = new SignupUserUseCase(userRepository);

    const result = await useCase.execute({ email: "dev@example.com", password: "password123" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBe("dev@example.com");
    }
    expect(userRepository.save).toHaveBeenCalledTimes(1);
  });

  it("fails with email_already_registered when the email is already taken", async () => {
    const userRepository = mock<UserRepository>();
    userRepository.findByEmail.mockResolvedValue(
      User.create({ email: "dev@example.com", passwordHash: "existing-hash" }),
    );
    const useCase = new SignupUserUseCase(userRepository);

    const result = await useCase.execute({ email: "dev@example.com", password: "password123" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("email_already_registered");
    }
    expect(userRepository.save).not.toHaveBeenCalled();
  });

  it("never persists the password in plaintext", async () => {
    const userRepository = mock<UserRepository>();
    userRepository.findByEmail.mockResolvedValue(null);
    const useCase = new SignupUserUseCase(userRepository);

    await useCase.execute({ email: "dev@example.com", password: "plaintext-password" });

    const savedUser = userRepository.save.mock.calls[0]?.[0];
    expect(savedUser?.passwordHash).toBeTruthy();
    expect(savedUser?.passwordHash).not.toBe("plaintext-password");
  });
});
