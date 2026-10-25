import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Single Managed Better Auth instance for the whole app.
 * Use it in Server Components, Server Actions, Route Handlers, and `proxy.ts`.
 */
export const auth = createNeonAuth({
  baseUrl: requireEnv("NEON_AUTH_BASE_URL"),
  cookies: {
    secret: requireEnv("NEON_AUTH_COOKIE_SECRET"),
    // How long the signed session-data cookie is trusted before re-checking with Neon Auth.
    // A revoked session (signed out remotely, password changed) stays usable for at most this long.
    // The SDK default is 300s; this is a control panel for personal data, so keep it short.
    sessionDataTtl: 60,
  },
});
