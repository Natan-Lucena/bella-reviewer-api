import { describe, expect, it } from "vitest";

import { Credential } from "../entities/credential.entity";
import { getServiceState, isConfigComplete } from "./repo-config-completeness";

function credential(type: "llm" | "scm" | "action_token" | "webhook_secret"): Credential {
  switch (type) {
    case "llm":
      return Credential.createLlm({ repoId: "repo-1", encryptedSecret: "x" });
    case "scm":
      return Credential.createScm({ repoId: "repo-1", encryptedSecret: "x" });
    case "action_token":
      return Credential.createActionToken({ repoId: "repo-1", secretHash: "x" });
    case "webhook_secret":
      return Credential.createWebhookSecret({ repoId: "repo-1", encryptedSecret: "x" });
  }
}

describe("isConfigComplete", () => {
  it("is true when all 4 credential types are present", () => {
    const credentials = [
      credential("llm"),
      credential("scm"),
      credential("action_token"),
      credential("webhook_secret"),
    ];

    expect(isConfigComplete(credentials)).toBe(true);
  });

  it("is false when a credential type is missing (e.g. only LLM configured)", () => {
    expect(isConfigComplete([credential("llm")])).toBe(false);
  });

  it("is false for an empty credential list", () => {
    expect(isConfigComplete([])).toBe(false);
  });
});

describe("getServiceState", () => {
  it("is inactive when the repo itself is inactive, regardless of config", () => {
    expect(getServiceState(false, true)).toBe("inactive");
    expect(getServiceState(false, false)).toBe("inactive");
  });

  it("is active when the repo is active and fully configured", () => {
    expect(getServiceState(true, true)).toBe("active");
  });

  it("is configuration_pending when active but not fully configured", () => {
    expect(getServiceState(true, false)).toBe("configuration_pending");
  });
});
