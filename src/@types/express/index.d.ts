// Set by auth-middleware.ts once the session cookie/token is validated. See
// backend-prds/02-auth-cadastro-login-sessao.md.
declare namespace Express {
  export interface Request {
    userId?: string;
  }
}
