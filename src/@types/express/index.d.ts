// Set by auth-middleware.ts once the session cookie/token is validated.
declare namespace Express {
  export interface Request {
    userId?: string;
    // Set by action-token-middleware.ts once the BELLA_TOKEN is validated —
    // resolved entirely from the token lookup, never sent by the caller.
    repoId?: string;
  }
}
