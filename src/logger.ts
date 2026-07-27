import winston from "winston";

import { config } from "./config";

// REGRA TRANSVERSAL (refinamento.md, Gap 9): nenhum log desta aplicação pode
// conter diff, trecho de código, prompt enviado ao LLM, resposta bruta do
// modelo, ou qualquer segredo (chave de API, PAT, action_token, webhook
// secret) em texto claro. Só metadados e métricas (ids, status, contagem de
// tokens, mensagens de erro de provedores). Ao chamar logger.error/info,
// nunca passe esses campos no objeto de metadados.

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
