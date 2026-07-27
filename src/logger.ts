import winston from "winston";

import { config } from "./config";

// CROSS-CUTTING RULE: no log in this application may contain a diff, a code
// snippet, the prompt sent to the LLM, the model's raw response, or any
// secret (API key, PAT, action_token, webhook secret) in plaintext. Only
// metadata and metrics (ids, status, token counts, provider error messages).
// When calling logger.error/info, never pass those fields in the metadata
// object.

export const logger = winston.createLogger({
  level: config.NODE_ENV === "production" ? "info" : "debug",
  format:
    config.NODE_ENV === "production"
      ? winston.format.combine(winston.format.timestamp(), winston.format.json())
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(
            ({ timestamp, level, message, ...meta }) =>
              `${timestamp} ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ""}`,
          ),
        ),
  transports: [new winston.transports.Console()],
});
