import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { User } from "../../../domain/entities/user.entity";
import { UserRepository } from "../../../domain/repository/user.repository";
import { GetCurrentUserUseCase } from "./get-current-user-use-case";
import { GetCurrentUserController } from "./get-current-user-controller";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("GetCurrentUserController", () => {
  it("returns the current user's data (never the password hash)", async () => {
    const user = User.create({ email: "dev@example.com", passwordHash: "hash" });
    const userRepository = mock<UserRepository>();
    userRepository.findById.mockResolvedValue(user);
    const controller = new GetCurrentUserController(new GetCurrentUserUseCase(userRepository));
    const req = { userId: user.id.value } as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.email).toBe("dev@example.com");
    expect(body.passwordHash).toBeUndefined();
  });

  it("returns 401 when the session's user no longer exists", async () => {
    const userRepository = mock<UserRepository>();
    userRepository.findById.mockResolvedValue(null);
    const controller = new GetCurrentUserController(new GetCurrentUserUseCase(userRepository));
    const req = { userId: "11111111-1111-1111-1111-111111111111" } as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
