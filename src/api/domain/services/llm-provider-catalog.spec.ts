import { describe, expect, it } from "vitest";

import { getDefaultModelForProvider, LLM_PROVIDER_CATALOG } from "./llm-provider-catalog";

describe("getDefaultModelForProvider", () => {
  it("returns the catalog's defaultModel for gemini", () => {
    expect(getDefaultModelForProvider("gemini")).toBe(LLM_PROVIDER_CATALOG.gemini.defaultModel);
  });

  it("returns the catalog's defaultModel for claude", () => {
    expect(getDefaultModelForProvider("claude")).toBe(LLM_PROVIDER_CATALOG.claude.defaultModel);
  });

  it("returns the catalog's defaultModel for openai", () => {
    expect(getDefaultModelForProvider("openai")).toBe(LLM_PROVIDER_CATALOG.openai.defaultModel);
  });
});

describe("LLM_PROVIDER_CATALOG", () => {
  it("gives every provider a non-empty defaultModel present in its own knownModels", () => {
    for (const entry of Object.values(LLM_PROVIDER_CATALOG)) {
      expect(entry.defaultModel.length).toBeGreaterThan(0);
      expect(entry.knownModels).toContain(entry.defaultModel);
    }
  });
});
