import { describe, expect, it } from "vitest";

import { classifyLlmError } from "./llm-error-classification";

const PATTERN = /overloaded|rate limit|timeout/i;

describe("classifyLlmError", () => {
  it.each([429, 500, 502, 503, 504])("classifies HTTP %d as transient", (status) => {
    expect(classifyLlmError({ status, message: "boom" }, PATTERN)).toEqual({
      type: "transient",
      statusCode: status,
      message: "boom",
    });
  });

  it.each([400, 401, 403])("classifies HTTP %d as permanent", (status) => {
    expect(classifyLlmError({ status, message: "boom" }, PATTERN)).toEqual({
      type: "permanent",
      statusCode: status,
      message: "boom",
    });
  });

  it("falls back to matching the message against the given pattern when there's no status", () => {
    const result = classifyLlmError(new Error("connect ETIMEDOUT: request timeout"), PATTERN);

    expect(result).toEqual({ type: "transient", statusCode: 0, message: expect.any(String) });
  });

  it("treats a message that doesn't match the given pattern as permanent", () => {
    const result = classifyLlmError(new Error("Something unexpected happened"), PATTERN);

    expect(result.type).toBe("permanent");
  });

  it("uses the caller-supplied pattern, not a hardcoded one", () => {
    const result = classifyLlmError(new Error("provider-specific overload wording"), /overload/i);

    expect(result.type).toBe("transient");
  });
});
