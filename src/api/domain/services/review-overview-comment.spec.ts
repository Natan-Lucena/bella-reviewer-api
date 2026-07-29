import { describe, expect, it } from "vitest";

import { buildOverviewComment } from "./review-overview-comment";

describe("buildOverviewComment", () => {
  it("wraps the overview text with an identifying header", () => {
    const comment = buildOverviewComment("Clean, well-tested change.");

    expect(comment).toContain("Bella");
    expect(comment).toContain("Clean, well-tested change.");
  });
});
