import { createApp } from "../src/app";

// Vercel auto-detects any file under api/ and deploys it as a Serverless
// Function (zero-config, no `builds` entry in vercel.json needed — that
// legacy config disables the project's own Build/Install Command settings
// entirely, which is exactly what broke package-manager detection here
// before). vercel.json only needs a rewrite so requests to paths like
// /auth or /repos (no /api prefix) reach this function.
export default createApp();
