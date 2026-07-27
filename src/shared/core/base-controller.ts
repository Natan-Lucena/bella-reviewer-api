import { Request, Response } from "express";

// In-house BaseController convention (see ../../../../arquitetura.md).
// Concrete controllers extend this and implement only executeImpl —
// execute() wraps it in try/catch so an unexpected thrown error always
// becomes a 500, and controllers never need their own try/catch for that.
// Response helpers always follow the project's error envelope
// ({ error: { code, message } }, see backend-prds/CONVENTIONS.md) — never
// call res.status(...) directly from a controller.
export abstract class BaseController {
  protected abstract executeImpl(req: Request, res: Response): Promise<Response | void>;

  async execute(req: Request, res: Response): Promise<Response | void> {
    try {
      return await this.executeImpl(req, res);
    } catch (error) {
      return this.fail(res, error);
    }
  }

  protected ok<T>(res: Response, dto: T): Response {
    return res.status(200).json(dto);
  }

  protected created<T>(res: Response, dto: T): Response {
    return res.status(201).json(dto);
  }

  protected accepted<T>(res: Response, dto: T): Response {
    return res.status(202).json(dto);
  }

  protected noContent(res: Response): Response {
    return res.status(204).end();
  }

  protected clientError(res: Response, code: string, message: string): Response {
    return res.status(400).json({ error: { code, message } });
  }

  protected unauthorized(res: Response, code: string, message: string): Response {
    return res.status(401).json({ error: { code, message } });
  }

  protected forbidden(res: Response, code: string, message: string): Response {
    return res.status(403).json({ error: { code, message } });
  }

  protected notFound(res: Response, code: string, message: string): Response {
    return res.status(404).json({ error: { code, message } });
  }

  protected conflict(res: Response, code: string, message: string): Response {
    return res.status(409).json({ error: { code, message } });
  }

  protected unprocessableEntity(res: Response, code: string, message: string): Response {
    return res.status(422).json({ error: { code, message } });
  }

  protected tooMany(res: Response, code: string, message: string): Response {
    return res.status(429).json({ error: { code, message } });
  }

  protected fail(res: Response, error: unknown): Response {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return res.status(500).json({ error: { code: "internal_error", message } });
  }
}
