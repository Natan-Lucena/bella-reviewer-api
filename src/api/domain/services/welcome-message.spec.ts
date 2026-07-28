import { describe, expect, it } from "vitest";

import { buildWelcomeMessage } from "./welcome-message";

describe("buildWelcomeMessage", () => {
  it("mentions Bella and embeds a gif via markdown image syntax", () => {
    const message = buildWelcomeMessage();

    expect(message).toContain("Bella");
    expect(message).toMatch(/!\[Bella\]\(https:\/\/media1\.giphy\.com\/.+\.gif\)/);
  });
});
