import { describe, expect, it } from "vitest";

import { RepoConfig } from "./repo-config.entity";

const baseProps = {
  repoId: "repo-1",
  model: "gemini-2.5-flash",
  tokenLimit: 100000,
};

describe("RepoConfig.create", () => {
  it("stores the given llmProvider instead of a fixed literal", () => {
    expect(RepoConfig.create({ ...baseProps, llmProvider: "gemini" }).llmProvider).toBe("gemini");
    expect(RepoConfig.create({ ...baseProps, llmProvider: "claude" }).llmProvider).toBe("claude");
    expect(RepoConfig.create({ ...baseProps, llmProvider: "openai" }).llmProvider).toBe("openai");
  });
});
