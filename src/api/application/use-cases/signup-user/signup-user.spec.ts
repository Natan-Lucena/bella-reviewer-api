import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { User } from "../../../domain/entities/user.entity";
import { UserRepository } from "../../../domain/repository/user.repository";
import { signupUser } from "./signup-user";

describe("signupUser", () => {
  it("creates a new user when the email isn't registered yet", async () => {
    const userRepository = mock<UserRepository>();
    userRepository.findByEmail.mockResolvedValue(null);

    const result = await signupUser(
      { email: "dev@example.com", password: "password123" },
      { userRepository },
    );

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

    const result = await signupUser(
      { email: "dev@example.com", password: "password123" },
      { userRepository },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("email_already_registered");
    }
    expect(userRepository.save).not.toHaveBeenCalled();
  });

  it("never persists the password in plaintext", async () => {
    const userRepository = mock<UserRepository>();
    userRepository.findByEmail.mockResolvedValue(null);

    await signupUser(
      { email: "dev@example.com", password: "plaintext-password" },
      { userRepository },
    );

    const savedUser = userRepository.save.mock.calls[0]?.[0];
    expect(savedUser?.passwordHash).toBeTruthy();
    expect(savedUser?.passwordHash).not.toBe("plaintext-password");
  });
});
