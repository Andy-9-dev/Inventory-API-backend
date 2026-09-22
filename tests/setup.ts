/**
 * tests/setup.ts — shared test infrastructure (PostgreSQL / Supabase edition)
 *
 * Strategy:
 *   • Each test file calls initTestDb() which creates an isolated Postgres
 *     schema named "test_<uuid_fragment>" inside the same Supabase database.
 *   • A pg.Pool is injected into the app via setPool() with search_path set
 *     to that schema, so every route handler query hits the test schema
 *     automatically — no application code changes needed.
 *   • teardownTestDb() drops the schema (CASCADE) and ends the pool, leaving
 *     the real "public" schema and its data completely untouched.
 *   • truncateAllTables() is exported for tests that want a clean slate
 *     between individual test cases without recreating the full schema.
 *
 * The three test files (auth, products, orders) use only initTestDb() and
 * teardownTestDb() — their test logic is identical to the SQLite version.
 */

import { Pool, PoolClient } from "pg";
import { randomBytes } from "crypto";
import supertest from "supertest";
import { app } from "../src/app";
import { setPool, initSchema } from "../src/db";

// ─── Internal state ───────────────────────────────────────────────────────────

let testPool: Pool | null = null;
let testSchemaName: string = "";

// ─── DB lifecycle ─────────────────────────────────────────────────────────────

/**
 * Creates an isolated test schema, initialises the full table schema inside
 * it, and injects a search_path-scoped pool into the app.
 *
 * Safe to call in beforeAll() — idempotent if called multiple times because
 * each call tears down any previous schema first.
 */
export async function initTestDb(): Promise<void> {
  // Tear down any leftovers from a previous run (e.g. if Jest crashed)
  await teardownTestDb();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL must be set in the environment for tests to run."
    );
  }

  // Unique schema name — prevents cross-file interference even if Jest runs
  // files in parallel or a previous teardown failed
  testSchemaName = `test_${randomBytes(6).toString("hex")}`;

  // Bootstrap pool (no search_path yet — we need to create the schema first)
  const bootstrapPool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });

  const client: PoolClient = await bootstrapPool.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${testSchemaName}"`);
    await client.query(`SET search_path TO "${testSchemaName}"`);
    await initSchema(client);
  } finally {
    client.release();
  }

  await bootstrapPool.end();

  // Now create the long-lived test pool with search_path baked in.
  // Every connection checked out of this pool will automatically target the
  // test schema — route handlers call getPool() and get this pool back.
  testPool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 5,
    // options= is appended to the connection string as a Postgres parameter;
    // this sets search_path for every new connection in the pool.
    options: `--search_path="${testSchemaName}"`,
  });

  // Inject into the app
  setPool(testPool);
}

/**
 * Drops the test schema (CASCADE removes all tables + data inside it) and
 * ends the pool.  Called in afterAll() of each test file.
 */
export async function teardownTestDb(): Promise<void> {
  if (!testSchemaName) return;

  // Use a fresh, unscoped pool to drop the schema (the test pool's
  // connections all have search_path set to it, which could cause issues)
  const connectionString = process.env.DATABASE_URL;
  if (connectionString && testSchemaName) {
    const cleanupPool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 1,
    });
    try {
      await cleanupPool.query(
        `DROP SCHEMA IF EXISTS "${testSchemaName}" CASCADE`
      );
    } finally {
      await cleanupPool.end();
    }
  }

  if (testPool) {
    await testPool.end();
    testPool = null;
  }

  // Reset the app's pool singleton so the next initTestDb() starts clean
  setPool(null);
  testSchemaName = "";
}

/**
 * Truncates all tables in the test schema, resetting them to empty.
 * Faster than recreating the schema — useful in beforeEach() blocks.
 * RESTART IDENTITY resets any sequences; CASCADE handles FK order.
 */
export async function truncateAllTables(): Promise<void> {
  if (!testPool) throw new Error("Test DB not initialised — call initTestDb() first.");
  await testPool.query(
    `TRUNCATE users, products, orders RESTART IDENTITY CASCADE`
  );
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export const request = supertest(app);

export interface TestUserCredentials {
  token: string;
  userId: string;
  email: string;
  role: "admin" | "user";
}

/**
 * Registers and logs in a test user in one call.
 * Returns the JWT token and user info for use in Authorization headers.
 */
export async function createAndLoginUser(
  email: string,
  password: string,
  role: "admin" | "user"
): Promise<TestUserCredentials> {
  await request
    .post("/api/auth/register")
    .send({ email, password, role })
    .expect(201);

  const loginRes = await request
    .post("/api/auth/login")
    .send({ email, password })
    .expect(200);

  return {
    token:  loginRes.body.token             as string,
    userId: loginRes.body.user.id           as string,
    email:  loginRes.body.user.email        as string,
    role:   loginRes.body.user.role         as "admin" | "user",
  };
}

/**
 * Returns a pre-formatted Bearer auth header value.
 */
export function bearerToken(token: string): string {
  return `Bearer ${token}`;
}
