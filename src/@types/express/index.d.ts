// Set by auth-middleware.ts once the session cookie/token is validated.
declare namespace Express {
  export interface Request {
    userId?: string;
  }
}
