import path from "path";
import { open, Database } from "sqlite";
import sqlite3 from "sqlite3";

// Singleton database connection — opened once and reused across the app
let db: Database | null = null;

/**
 * Opens (or returns the existing) SQLite connection and ensures the schema
 * is up to date. Safe to call multiple times — will only initialise once.
 *
 * In production: opens the file at DB_PATH env var or inventory.db.
 * In tests: call setDb() with an in-memory connection before this runs.
 */
export async function getDb(): Promise<Database> {
  if (db) return db;

  const dbPath =
    process.env.DB_PATH || path.join(__dirname, "..", "inventory.db");

  db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  // Enable foreign key enforcement for this connection
  await db.exec("PRAGMA foreign_keys = ON;");

  await initSchema(db);

  return db;
}

/**
 * Overrides the singleton with the provided Database instance.
 * Called by tests to inject a fresh in-memory DB before each test file.
 * Pass null to reset the singleton so the next getDb() call opens fresh.
 */
export function setDb(instance: Database | null): void {
  db = instance;
}

/**
 * Creates all tables if they don't already exist, then runs additive
 * migrations on existing databases.
 */
export async function initSchema(database: Database): Promise<void> {
  await database.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id       TEXT    PRIMARY KEY,
      name     TEXT    NOT NULL,
      price    REAL    NOT NULL,
      stock    INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS orders (
      id         TEXT    PRIMARY KEY,
      product_id TEXT    NOT NULL REFERENCES products(id),
      quantity   INTEGER NOT NULL,
      status     TEXT    NOT NULL CHECK(status IN ('confirmed', 'rejected')),
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Users table for JWT auth
  await database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT    PRIMARY KEY,
      email         TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL CHECK(role IN ('admin', 'user')),
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migration: add category column to products if it doesn't exist yet.
  // SQLite has no "ADD COLUMN IF NOT EXISTS" — attempt and swallow the
  // duplicate-column error only; all other errors are re-thrown.
  try {
    await database.exec(
      "ALTER TABLE products ADD COLUMN category TEXT NOT NULL DEFAULT '';"
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("duplicate column name")) {
      throw err;
    }
  }
}
