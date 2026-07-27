import { randomUUID } from "node:crypto";

// Wraps the raw string id in a value object so the identifier strategy can
// change later (e.g., a different id format) without touching every entity
// that holds an `id: Uuid` field.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class Uuid {
  readonly value: string;

  constructor(value: string) {
    if (!UUID_PATTERN.test(value)) {
      throw new Error(`Invalid UUID: "${value}"`);
    }
    this.value = value;
  }

  static random(): Uuid {
    return new Uuid(randomUUID());
  }
}
