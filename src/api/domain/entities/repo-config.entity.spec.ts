import { describe, expect, it } from "vitest";

import { RepoConfig } from "./repo-config.entity";

const baseProps = {
  repoId: "repo-1",
  model: "gemini-2.5-flash",
  tokenLimit: 100000,
};

describe("RepoConfig.hasDuplicateCategories", () => {
  it("returns false when every category is unique", () => {
    const config = RepoConfig.create({
      ...baseProps,
      enabledCategories: ["bug", "security", "performance"],
    });

    expect(config.hasDuplicateCategories()).toBe(false);
  });

  it("returns false for an empty list", () => {
    const config = RepoConfig.create({ ...baseProps, enabledCategories: [] });

    expect(config.hasDuplicateCategories()).toBe(false);
  });

  it("returns true when a category is repeated", () => {
    const config = RepoConfig.create({
      ...baseProps,
      enabledCategories: ["bug", "security", "bug"],
    });

    expect(config.hasDuplicateCategories()).toBe(true);
  });
});
