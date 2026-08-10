import { describe, expect, it } from "vitest";

import { Credential } from "../entities/credential.entity";
import { findCredentialByType } from "./find-credential-by-type";

describe("findCredentialByType", () => {
  it("returns the credential with the matching type", () => {
    const llm = Credential.createLlm({ repoId: "repo-1", encryptedSecret: "enc-llm" });
    const scm = Credential.createScm({ repoId: "repo-1", encryptedSecret: "enc-scm" });

    expect(findCredentialByType([llm, scm], "scm")).toBe(scm);
  });

  it("returns undefined when no credential matches", () => {
    const llm = Credential.createLlm({ repoId: "repo-1", encryptedSecret: "enc-llm" });

    expect(findCredentialByType([llm], "webhook_secret")).toBeUndefined();
  });
});
