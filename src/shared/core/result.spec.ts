import { describe, expect, it } from "vitest";

import { err, ok } from "./result";

// Example test — proves the Vitest setup works. The real tests for each use
// case live alongside the implementation, following the acceptance
// criteria of each PRD in ../../../../backend-prds/.
describe("Result", () => {
  it("ok() produces a success result", () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it("err() produces an error result", () => {
    const result = err("something went wrong");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("something went wrong");
    }
  });
});
