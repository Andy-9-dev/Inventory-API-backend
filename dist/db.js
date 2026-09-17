"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
const path_1 = __importDefault(require("path"));
const sqlite_1 = require("sqlite");
const sqlite3_1 = __importDefault(require("sqlite3"));
// Singleton database connection — opened once and reused across the app
let db = null;
/**
 * Opens (or returns the existing) SQLite connection and ensures the schema
 * is up to date. Safe to call multiple times — will only initialise once.
 */
async function getDb() {
    if (db)
        return db;
    const dbPath = process.env.DB_PATH || path_1.default.join(__dirname, "..", "inventory.db");
    db = await (0, sqlite_1.open)({
        filename: dbPath,
        driver: sqlite3_1.default.Database,
    });
    // Enable foreign key enforcement for this connection
    await db.exec("PRAGMA foreign_keys = ON;");
    await initSchema(db);
    return db;
}
/**
 * Creates the products and orders tables if they don't already exist,
 * then runs any additive migrations needed on existing databases.
 */
async function initSchema(database) {
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
    // Migration: add the category column to products if it doesn't exist yet.
    // SQLite has no "ADD COLUMN IF NOT EXISTS", so we attempt it and ignore the
    // "duplicate column" error — all other errors are re-thrown.
    try {
        await database.exec("ALTER TABLE products ADD COLUMN category TEXT NOT NULL DEFAULT '';");
        console.log("Migration applied: products.category column added.");
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes("duplicate column name")) {
            throw err;
        }
        // Column already exists — nothing to do.
    }
    console.log("Database schema initialised.");
}
