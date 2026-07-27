import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { User } from "../../../domain/entities/user.entity";
import { UserRepository } from "../../../domain/repository/user.repository";
import { signupUserController } from "./signup-user-controller";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("signupUserController", () => {
  it("returns 400 for a malformed body", async () => {
    const userRepository = mock<UserRepository>();
    const controller = signupUserController({ userRepository });
    const req = { body: { email: "not-an-email", password: "short" } } as Request;
    const res = createMockResponse();

    await controller(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "validation_error" }) }),
    );
  });

  it("returns 409 when the email is already registered", async () => {
    const userRepository = mock<UserRepository>();
    userRepository.findByEmail.mockResolvedValue(
      User.create({ email: "dev@example.com", passwordHash: "hash" }),
    );
    const controller = signupUserController({ userRepository });
    const req = { body: { email: "dev@example.com", password: "password123" } } as Request;
    const res = createMockResponse();

    await controller(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("returns 201 with the created user, never the password hash, on success", async () => {
    const userRepository = mock<UserRepository>();
    userRepository.findByEmail.mockResolvedValue(null);
    const controller = signupUserController({ userRepository });
    const req = { body: { email: "dev@example.com", password: "password123" } } as Request;
    const res = createMockResponse();

    await controller(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(201);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.email).toBe("dev@example.com");
    expect(body.passwordHash).toBeUndefined();
  });
});
