import app from "./app";
import { config } from "./config";
import { logger } from "./logger";

// Only reached locally (`pnpm dev`) or on a traditional host
// (`node dist/index.js`) — the Vercel deployment (api/index.ts) imports the
// same app instance and never calls .listen(), since a serverless function
// is invoked per-request rather than bound to a socket.
app.listen(config.PORT, () => {
  logger.info(`Server started on port ${config.PORT}`);
});
