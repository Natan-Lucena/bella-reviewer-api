import { describe, expect, it } from "vitest";

import { Prompt } from "./prompt.entity";

const baseProps = {
  userId: "user-1",
  name: "My review style",
  content: "Focus on security and ignore formatting nitpicks.",
};

describe("Prompt.create", () => {
  it("generates a random id and stamps createdAt/updatedAt equally", () => {
    const prompt = Prompt.create(baseProps);

    expect(prompt.id.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(prompt.createdAt).toEqual(prompt.updatedAt);
  });

  it("stores the given userId/name/content as-is", () => {
    const prompt = Prompt.create(baseProps);

    expect(prompt.userId).toBe(baseProps.userId);
    expect(prompt.name).toBe(baseProps.name);
    expect(prompt.content).toBe(baseProps.content);
  });
});

describe("Prompt.update", () => {
  it("applies a partial patch, keeping unset fields at their current value", () => {
    const prompt = Prompt.create(baseProps);

    const updated = prompt.update({ name: "New name" });

    expect(updated.name).toBe("New name");
    expect(updated.content).toBe(baseProps.content);
  });

  it("keeps id/userId/createdAt unchanged and bumps updatedAt", () => {
    const prompt = Prompt.create(baseProps);

    const updated = prompt.update({ content: "New content" });

    expect(updated.id).toBe(prompt.id);
    expect(updated.userId).toBe(prompt.userId);
    expect(updated.createdAt).toBe(prompt.createdAt);
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(prompt.updatedAt.getTime());
  });

  it("with no props at all, keeps every field the same except updatedAt", () => {
    const prompt = Prompt.create(baseProps);

    const updated = prompt.update({});

    expect(updated.name).toBe(prompt.name);
    expect(updated.content).toBe(prompt.content);
  });
});

describe("Prompt.fromPersistence", () => {
  it("reconstructs an equivalent entity from raw persistence fields", () => {
    const createdAt = new Date("2024-01-01T00:00:00.000Z");
    const updatedAt = new Date("2024-02-01T00:00:00.000Z");

    const prompt = Prompt.fromPersistence({
      id: "11111111-1111-1111-1111-111111111111",
      userId: baseProps.userId,
      name: baseProps.name,
      content: baseProps.content,
      createdAt,
      updatedAt,
    });

    expect(prompt.id.value).toBe("11111111-1111-1111-1111-111111111111");
    expect(prompt.userId).toBe(baseProps.userId);
    expect(prompt.name).toBe(baseProps.name);
    expect(prompt.content).toBe(baseProps.content);
    expect(prompt.createdAt).toBe(createdAt);
    expect(prompt.updatedAt).toBe(updatedAt);
  });
});

describe("Prompt.toJSON", () => {
  it("builds the API-facing shape, excluding userId", () => {
    const createdAt = new Date("2024-01-01T00:00:00.000Z");
    const updatedAt = new Date("2024-02-01T00:00:00.000Z");

    const prompt = Prompt.fromPersistence({
      id: "11111111-1111-1111-1111-111111111111",
      userId: baseProps.userId,
      name: baseProps.name,
      content: baseProps.content,
      createdAt,
      updatedAt,
    });

    expect(prompt.toJSON()).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      name: baseProps.name,
      content: baseProps.content,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });
  });
});
