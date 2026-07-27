import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";

import { config } from "../../../../config";
import { signSessionToken } from "../../../../shared/infra/auth/session-token";
import { authMiddleware } from "./auth-middleware";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("authMiddleware", () => {
  it("injects userId and calls next() for a valid token", () => {
    const token = signSessionToken({ userId: "user-1", email: "dev@example.com" });
    const req = { cookies: { session: token } } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    authMiddleware(req, res, next);

    expect(req.userId).toBe("user-1");
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects an expired token with 401, without calling next()", () => {
    const expiredToken = jwt.sign(
      { userId: "user-1", email: "dev@example.com" },
      config.SESSION_SECRET,
      { expiresIn: -10 },
    );
    const req = { cookies: { session: expiredToken } } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a token signed with the wrong secret, without calling next()", () => {
    const tamperedToken = jwt.sign({ userId: "user-1", email: "dev@example.com" }, "wrong-secret", {
      expiresIn: "7d",
    });
    const req = { cookies: { session: tamperedToken } } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a missing cookie with 401, without calling next()", () => {
    const req = { cookies: {} } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
