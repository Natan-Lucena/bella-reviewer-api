// Agnostic async message queue contract. Concrete implementations live in
// src/api/integration/<provider>/ (e.g., qstash/qstash-queue.ts).
// This file must not import anything from integration/, infraestructure/,
// or any specific SDK.

export interface QueuePort {
  publish(params: PublishMessageParams): Promise<void>;
}

export type PublishMessageParams = {
  url: string; // full destination URL the queue calls back with the body
  body: unknown;
  // Forwarded to the destination request when the queue calls back — used
  // to let the destination authenticate the callback as actually coming
  // from the queue (see integration/qstash/qstash-queue.ts).
  headers?: Record<string, string>;
};
