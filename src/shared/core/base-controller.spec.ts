import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { BaseController } from "./base-controller";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res;
}

class ThrowingController extends BaseController {
  protected executeImpl(): Promise<Response | void> {
    throw new Error("boom");
  }
}

class OkController extends BaseController {
  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    return this.ok(res, { hello: "world" });
  }
}

describe("BaseController", () => {
  it("converts an unexpected thrown error into a 500 with the error envelope", async () => {
    const controller = new ThrowingController();
    const req = {} as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "internal_error" }) }),
    );
  });

  it("delegates to executeImpl on success", async () => {
    const controller = new OkController();
    const req = {} as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ hello: "world" });
  });

  it("clientError/unauthorized/conflict all follow the { error: { code, message } } envelope", () => {
    const controller = new OkController() as unknown as {
      clientError: BaseController["clientError"];
      unauthorized: BaseController["unauthorized"];
      conflict: BaseController["conflict"];
    };
    const res = createMockResponse();

    controller.clientError(res, "validation_error", "bad input");
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "validation_error", message: "bad input" },
    });

    controller.unauthorized(res, "not_authenticated", "no session");
    expect(res.status).toHaveBeenCalledWith(401);

    controller.conflict(res, "email_already_registered", "taken");
    expect(res.status).toHaveBeenCalledWith(409);
  });
});
