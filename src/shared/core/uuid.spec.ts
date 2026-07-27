import { describe, expect, it } from "vitest";

import { Uuid } from "./uuid";

describe("Uuid", () => {
  it("random() generates a value that the constructor accepts", () => {
    const uuid = Uuid.random();

    expect(() => new Uuid(uuid.value)).not.toThrow();
  });

  it("random() doesn't repeat values across calls", () => {
    expect(Uuid.random().value).not.toBe(Uuid.random().value);
  });

  it("constructor accepts a well-formed UUID string", () => {
    const value = "550e8400-e29b-41d4-a716-446655440000";

    expect(new Uuid(value).value).toBe(value);
  });

  it("constructor rejects a malformed string", () => {
    expect(() => new Uuid("not-a-uuid")).toThrow(/Invalid UUID/);
  });

  it("constructor rejects an empty string", () => {
    expect(() => new Uuid("")).toThrow(/Invalid UUID/);
  });
});
