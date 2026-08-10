import { describe, expect, it } from "vitest";

import { normalizeLabel } from "./normalize-label";

describe("normalizeLabel", () => {
  it("trims whitespace and lowercases", () => {
    expect(normalizeLabel("  Bug  ")).toBe("bug");
  });
});
