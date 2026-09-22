import { Pool, PoolClient } from "pg";

// ─── Pool singleton ───────────────────────────────────────────────────────────
//
// One Pool is shared across the entire application.  pg.Pool manages a set of
// underlying TCP connections and hands them out on demand — far more efficient
// than opening a new connection per request.
//
// In tests, setPool() is called with a pool that has search_path pre-set to
// the isolated test schema, so every query in route handlers automatically
// hits the right schema without any code changes.

let pool: Pool | null = null;

/**
 * Returns the active pool, creating it from DATABASE_URL on first call.
 * Safe to call many times — initialises only once.
 *
 * Tests inject their own pool via setPool() before this is first called,
 * so this branch only runs in production / dev.
 */
export async function getPool(): Promise<Pool> {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set.");
  }

  pool = new Pool({
    connectionString,
    // Supabase (and most managed Postgres providers) require SSL.
    // rejectUnauthorized: false accepts self-signed certs — fine for Supabase.
    ssl: { rejectUnauthorized: false },
    // Keep the pool small — Supabase free tier has a 60-connection limit.
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  // Smoke-test the connection and initialise the schema
  const client = await pool.connect();
  try {
    await initSchema(client);
  } finally {
    client.release();
  }

  return pool;
}

// Keep the old name as an alias so src/index.ts and tests that call getDb()
// still compile without changes.
export const getDb = getPool;

/**
 * Replaces the pool singleton.  Pass null to reset so the next getPool()
 * call builds a fresh pool.  Used by tests to inject a schema-scoped pool.
 */
export function setPool(instance: Pool | null): void {
  pool = instance;
}

// Keep the old name as an alias matching the pattern in tests/setup.ts.
export const setDb = setPool;

// ─── Schema initialisation ────────────────────────────────────────────────────

/**
 * Creates all tables if they don't already exist and applies additive
 * column migrations.  Accepts a PoolClient so tests can call it inside a
 * schema-scoped session (SET search_path already applied on that client).
 *
 * Postgres differences vs the old SQLite version:
 *   • REAL  → NUMERIC(12,4)  (Postgres REAL is only 6-digit precision; NUMERIC is exact)
 *   • TEXT DEFAULT (datetime('now'))  → TIMESTAMPTZ NOT NULL DEFAULT NOW()
 *   • SQLite try/catch for ADD COLUMN  → ADD COLUMN IF NOT EXISTS (native Postgres syntax)
 */
export async function initSchema(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS products (
      id       TEXT           PRIMARY KEY,
      name     TEXT           NOT NULL,
      category TEXT           NOT NULL DEFAULT '',
      price    NUMERIC(12,4)  NOT NULL,
      stock    INTEGER        NOT NULL DEFAULT 0
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id         TEXT        PRIMARY KEY,
      product_id TEXT        NOT NULL REFERENCES products(id),
      quantity   INTEGER     NOT NULL,
      status     TEXT        NOT NULL CHECK (status IN ('confirmed', 'rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT        PRIMARY KEY,
      email         TEXT        NOT NULL UNIQUE,
      password_hash TEXT        NOT NULL,
      role          TEXT        NOT NULL CHECK (role IN ('admin', 'user')),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Additive migration: add category if an older schema doesn't have it yet.
  // Unlike SQLite, Postgres supports IF NOT EXISTS directly on ADD COLUMN.
  await client.query(`
    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '';
  `);
}
