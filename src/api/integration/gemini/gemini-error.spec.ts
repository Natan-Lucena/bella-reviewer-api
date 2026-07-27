import { describe, expect, it } from "vitest";

import { classifyGeminiError } from "./gemini-error";

describe("classifyGeminiError", () => {
  it.each([429, 500, 502, 503, 504])("classifies HTTP %d as transient", (status) => {
    expect(classifyGeminiError({ status, message: "boom" })).toEqual({
      type: "transient",
      statusCode: status,
      message: "boom",
    });
  });

  it.each([400, 401, 403])("classifies HTTP %d as permanent", (status) => {
    expect(classifyGeminiError({ status, message: "boom" })).toEqual({
      type: "permanent",
      statusCode: status,
      message: "boom",
    });
  });

  it("falls back to matching the message when there's no status field", () => {
    const result = classifyGeminiError(new Error("The model is overloaded, try again later"));

    expect(result.type).toBe("transient");
    expect(result.statusCode).toBe(0);
  });

  it("treats an unrecognized message with no status as permanent", () => {
    const result = classifyGeminiError(new Error("Something unexpected happened"));

    expect(result.type).toBe("permanent");
  });
});
