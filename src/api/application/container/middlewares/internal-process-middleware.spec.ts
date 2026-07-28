import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { config } from "../../../../config";
import { internalProcessMiddleware } from "./internal-process-middleware";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("internalProcessMiddleware", () => {
  it("calls next() for the correct bearer token", () => {
    const req = {
      headers: { authorization: `Bearer ${config.INTERNAL_PROCESS_API_KEY}` },
    } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    internalProcessMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects a missing Authorization header", () => {
    const req = { headers: {} } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    internalProcessMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a malformed (non-Bearer) Authorization header", () => {
    const req = { headers: { authorization: "Basic abc123" } } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    internalProcessMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a wrong token", () => {
    const req = { headers: { authorization: "Bearer wrong-key" } } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    internalProcessMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
