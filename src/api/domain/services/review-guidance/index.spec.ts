import { describe, expect, it } from "vitest";

import { buildReviewGuidance } from "./index";

describe("buildReviewGuidance", () => {
  it("combines every guidance section into one string", () => {
    const guidance = buildReviewGuidance();

    expect(guidance).toContain("## Review mindset");
    expect(guidance).toContain("## Architecture review");
    expect(guidance).toContain("## Security review");
    expect(guidance).toContain("## Performance review");
    expect(guidance).toContain("## Async and concurrency review");
    expect(guidance).toContain("## Error handling review");
    expect(guidance).toContain("## Code quality review");
    expect(guidance).toContain("## Common bugs checklist");
  });

  it("separates sections so they don't run into each other", () => {
    const guidance = buildReviewGuidance();

    expect(guidance).toContain("\n\n---\n\n");
  });
});
