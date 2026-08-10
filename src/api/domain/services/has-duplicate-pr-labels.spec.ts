import { describe, expect, it } from "vitest";

import { hasDuplicatePrLabels } from "./has-duplicate-pr-labels";

describe("hasDuplicatePrLabels", () => {
  it("returns false for a list without duplicates", () => {
    expect(hasDuplicatePrLabels(["bug", "needs-review"])).toBe(false);
  });

  it("returns true when the same label appears twice", () => {
    expect(hasDuplicatePrLabels(["bug", "needs-review", "bug"])).toBe(true);
  });

  it("returns false for an empty list", () => {
    expect(hasDuplicatePrLabels([])).toBe(false);
  });
});
