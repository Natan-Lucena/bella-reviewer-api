import { describe, expect, it } from "vitest";

import { failure, success } from "./result";

// Example test — proves the Vitest setup works. The real tests for each use
// case live alongside the implementation, following the acceptance
// criteria of each PRD in ../../../../backend-prds/.
describe("Result", () => {
  it("success() produces a success result", () => {
    const result = success(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it("failure() produces an error result", () => {
    const result = failure("something went wrong");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("something went wrong");
    }
  });
});
