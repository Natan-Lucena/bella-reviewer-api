// Vercel auto-detects any file under api/ and deploys it as a Serverless
// Function (zero-config, no `builds` entry in vercel.json needed — that
// legacy config disables the project's own Build/Install Command settings
// entirely, which is exactly what broke package-manager detection here
// before). vercel.json only needs a rewrite so requests to paths like
// /auth or /repos (no /api prefix) reach this function.
//
// Re-exports src/app.ts's own default export rather than calling
// createApp() again here, so there's a single Express app instance shared
// by whichever file Vercel actually invokes (see the comment on that
// default export for why this matters).
export { default } from "../src/app";
