import { describe, expect, it } from "vitest";
import { z } from "zod";

import { formatZodError } from "./format-zod-error";

describe("formatZodError", () => {
  it("maps every issue, not just the first", () => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
    });
    const result = schema.safeParse({ email: "not-an-email", password: "short" });
    expect(result.success).toBe(false);
    if (result.success) return;

    const message = formatZodError(result.error);

    expect(message).toContain("email");
    expect(message).toContain("password");
  });

  it("omits the path prefix for root-level issues", () => {
    const schema = z.string().min(1);
    const result = schema.safeParse("");
    expect(result.success).toBe(false);
    if (result.success) return;

    const message = formatZodError(result.error);

    expect(message).not.toContain(":");
  });
});
