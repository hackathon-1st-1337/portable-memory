/**
 * Portable Memory — Drizzle ORM client
 *
 * Uses the Neon serverless driver (HTTPS/WebSocket on port 443)
 * because direct Postgres on port 5432 is not reachable from this machine.
 *
 * The Pool is pooled (connection pooler URL) and supports transactions.
 */
import "server-only";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// Singleton pool — next.js hot-reload safe (module-level singletons are cached per worker)
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });

export type DB = typeof db;
