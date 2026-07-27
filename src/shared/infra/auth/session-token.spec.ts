import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";

import { config } from "../../../config";
import { signSessionToken, verifySessionToken } from "./session-token";

describe("session-token", () => {
  it("verifySessionToken() reads back what signSessionToken() encoded", () => {
    const token = signSessionToken({ userId: "user-1", email: "dev@example.com" });

    const payload = verifySessionToken(token);

    expect(payload.userId).toBe("user-1");
    expect(payload.email).toBe("dev@example.com");
  });

  it("rejects a token signed with a different secret", () => {
    const token = jwt.sign({ userId: "user-1", email: "dev@example.com" }, "wrong-secret", {
      expiresIn: "7d",
    });

    expect(() => verifySessionToken(token)).toThrow();
  });

  it("rejects an expired token", () => {
    const token = jwt.sign({ userId: "user-1", email: "dev@example.com" }, config.SESSION_SECRET, {
      expiresIn: -10, // already expired
    });

    expect(() => verifySessionToken(token)).toThrow(/expired/i);
  });

  it("rejects a malformed token", () => {
    expect(() => verifySessionToken("not-a-real-token")).toThrow();
  });
});
