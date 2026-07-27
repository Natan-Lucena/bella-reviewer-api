import { logger } from "../../../logger";
import { classifyQstashError } from "./qstash-error";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
};

// Retries `fn` with exponential backoff, but only for transient QStash
// errors (429, 5xx, timeouts); permanent errors (400/401/403) bubble up on
// the first attempt, since retrying them would never succeed.
export async function withQstashRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseDelayMs = 1000 }: RetryOptions = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const { type } = classifyQstashError(error);
      if (type !== "transient" || attempt === attempts) {
        break;
      }

      const delay = baseDelayMs * 2 ** (attempt - 1);
      logger.warn(
        `QStash transient error, retrying (attempt ${attempt}/${attempts}) in ${delay}ms`,
      );
      await sleep(delay);
    }
  }

  throw lastError;
}
