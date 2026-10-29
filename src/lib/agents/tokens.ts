import "server-only";
import { createHmac, randomBytes } from "crypto";

function getPepper(): string {
  const pepper = process.env.TOKEN_PEPPER;
  if (!pepper) {
    throw new Error("TOKEN_PEPPER is not configured in environment variables");
  }
  return pepper;
}

/**
 * Computes HMAC-SHA256 of the raw token string using the system TOKEN_PEPPER.
 * Returns a Buffer suitable for Postgres bytea column.
 */
export function hashToken(rawToken: string): Buffer {
  return createHmac("sha256", getPepper()).update(rawToken).digest();
}

export interface GeneratedToken {
  /** The full secret bearer token (shown to the user only once) */
  rawToken: string;
  /** Display prefix (e.g. "pm_live_8f2k") */
  prefix: string;
  /** HMAC-SHA256 hash to store in the database */
  tokenHash: Buffer;
}

/**
 * Generates a cryptographically secure agent bearer token.
 * Format: pm_live_<48 hex chars>
 */
export function generateToken(label?: string): GeneratedToken {
  const randomHex = randomBytes(24).toString("hex");
  const rawToken = `pm_live_${randomHex}`;
  const prefix = rawToken.slice(0, 12);
  const tokenHash = hashToken(rawToken);

  return { rawToken, prefix, tokenHash };
}
