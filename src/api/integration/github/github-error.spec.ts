import { describe, expect, it } from "vitest";

import { classifyGithubError } from "./github-error";

describe("classifyGithubError", () => {
  it.each([429, 500, 502, 503, 504])("classifies HTTP %d as transient", (status) => {
    expect(classifyGithubError({ status, message: "boom" })).toEqual({
      type: "transient",
      statusCode: status,
      message: "boom",
    });
  });

  it.each([401, 403, 404, 422])("classifies HTTP %d as permanent", (status) => {
    expect(classifyGithubError({ status, message: "boom" })).toEqual({
      type: "permanent",
      statusCode: status,
      message: "boom",
    });
  });

  it("falls back to matching the message when there's no status field", () => {
    const result = classifyGithubError(
      new Error("request to https://api.github.com failed, reason: ETIMEDOUT"),
    );

    expect(result.type).toBe("transient");
    expect(result.statusCode).toBe(0);
  });

  it("treats an unrecognized message with no status as permanent", () => {
    const result = classifyGithubError(new Error("Something unexpected happened"));

    expect(result.type).toBe("permanent");
  });
});
