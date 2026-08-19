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

  it("defaults promptId to null (Bella Default Skill)", () => {
    expect(RepoConfig.create({ ...baseProps, llmProvider: "gemini" }).promptId).toBeNull();
  });
});

describe("RepoConfig.update — promptId three-state semantics", () => {
  it("leaves promptId untouched when the key is omitted from the patch", () => {
    const config = RepoConfig.create({ ...baseProps, llmProvider: "gemini" }).update({
      promptId: "11111111-1111-1111-1111-111111111111",
    });

    const updated = config.update({ temperature: 0.9 });

    expect(updated.promptId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("clears promptId back to null when explicitly passed null", () => {
    const config = RepoConfig.create({ ...baseProps, llmProvider: "gemini" }).update({
      promptId: "11111111-1111-1111-1111-111111111111",
    });

    const updated = config.update({ promptId: null });

    expect(updated.promptId).toBeNull();
  });

  it("sets promptId when a string is passed", () => {
    const config = RepoConfig.create({ ...baseProps, llmProvider: "gemini" });

    const updated = config.update({ promptId: "22222222-2222-2222-2222-222222222222" });

    expect(updated.promptId).toBe("22222222-2222-2222-2222-222222222222");
  });
});
