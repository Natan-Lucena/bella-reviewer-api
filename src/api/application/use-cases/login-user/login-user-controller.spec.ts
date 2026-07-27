import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { User } from "../../../domain/entities/user.entity";
import { UserRepository } from "../../../domain/repository/user.repository";
import { LoginUserUseCase } from "./login-user-use-case";
import { LoginUserController } from "./login-user-controller";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.cookie = vi.fn().mockReturnValue(res);
  return res;
}

describe("LoginUserController", () => {
  it("returns 400 for a malformed body", async () => {
    const userRepository = mock<UserRepository>();
    const controller = new LoginUserController(new LoginUserUseCase(userRepository));
    const req = { body: {} } as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 401 without setting a cookie when credentials are invalid", async () => {
    const userRepository = mock<UserRepository>();
    userRepository.findByEmail.mockResolvedValue(null);
    const controller = new LoginUserController(new LoginUserUseCase(userRepository));
    const req = { body: { email: "nobody@example.com", password: "whatever" } } as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("sets an httpOnly session cookie and returns the user on success", async () => {
    const userRepository = mock<UserRepository>();
    userRepository.findByEmail.mockResolvedValue(
      User.create({ email: "dev@example.com", passwordHash: await bcrypt.hash("password123", 4) }),
    );
    const controller = new LoginUserController(new LoginUserUseCase(userRepository));
    const req = { body: { email: "dev@example.com", password: "password123" } } as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.cookie).toHaveBeenCalledWith(
      "session",
      expect.any(String),
      expect.objectContaining({ httpOnly: true }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body).toEqual({ id: expect.any(String), email: "dev@example.com" });
  });
});
