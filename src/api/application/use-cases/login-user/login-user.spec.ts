import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { User } from "../../../domain/entities/user.entity";
import { UserRepository } from "../../../domain/repository/user.repository";
import { loginUser } from "./login-user";

describe("loginUser", () => {
  it("succeeds and returns a token when the password matches", async () => {
    const userRepository = mock<UserRepository>();
    userRepository.findByEmail.mockResolvedValue(
      User.create({
        email: "dev@example.com",
        passwordHash: await bcrypt.hash("correct-password", 4),
      }),
    );

    const result = await loginUser(
      { email: "dev@example.com", password: "correct-password" },
      { userRepository },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBe("dev@example.com");
      expect(typeof result.value.token).toBe("string");
    }
  });

  it("fails with invalid_credentials when the email isn't registered", async () => {
    const userRepository = mock<UserRepository>();
    userRepository.findByEmail.mockResolvedValue(null);

    const result = await loginUser(
      { email: "nobody@example.com", password: "whatever" },
      { userRepository },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_credentials");
    }
  });

  it("fails with the exact same error when the password is wrong", async () => {
    const userRepository = mock<UserRepository>();
    userRepository.findByEmail.mockResolvedValue(
      User.create({
        email: "dev@example.com",
        passwordHash: await bcrypt.hash("correct-password", 4),
      }),
    );

    const result = await loginUser(
      { email: "dev@example.com", password: "wrong-password" },
      { userRepository },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_credentials");
    }
  });
});
