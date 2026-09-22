import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getPool } from "../db";
import { Product, CreateProductBody } from "../types";

const router = Router();

// Postgres returns NUMERIC columns as strings to preserve precision.
// We cast price to FLOAT8 in every SELECT so route responses contain JS
// numbers, matching the Product interface and keeping test assertions clean.
const PRODUCT_COLS = `id, name, category, price::float8 AS price, stock`;

// ─── GET /api/products ────────────────────────────────────────────────────────
router.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const pool = await getPool();
    const result = await pool.query<Product>(
      `SELECT ${PRODUCT_COLS} FROM products ORDER BY name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/products error:", err);
    res.status(500).json({ error: "Failed to retrieve products." });
  }
});

// ─── GET /api/products/:id ────────────────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = await getPool();
    const result = await pool.query<Product>(
      `SELECT ${PRODUCT_COLS} FROM products WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "Product not found." });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("GET /api/products/:id error:", err);
    res.status(500).json({ error: "Failed to retrieve product." });
  }
});

// ─── POST /api/products ───────────────────────────────────────────────────────
router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, category, price, stock } = req.body as CreateProductBody;

    // ── Validation ──────────────────────────────────────────────────────────
    if (
      name === undefined ||
      category === undefined ||
      price === undefined ||
      stock === undefined
    ) {
      res
        .status(400)
        .json({ error: "name, category, price, and stock are all required." });
      return;
    }

    if (typeof name !== "string" || name.trim() === "") {
      res.status(400).json({ error: "name must be a non-empty string." });
      return;
    }

    if (typeof category !== "string" || category.trim() === "") {
      res.status(400).json({ error: "category must be a non-empty string." });
      return;
    }

    if (typeof price !== "number" || isNaN(price) || price < 0) {
      res.status(400).json({ error: "price must be a non-negative number." });
      return;
    }

    if (
      typeof stock !== "number" ||
      isNaN(stock) ||
      stock < 0 ||
      !Number.isInteger(stock)
    ) {
      res.status(400).json({ error: "stock must be a non-negative integer." });
      return;
    }
    // ────────────────────────────────────────────────────────────────────────

    const id = uuidv4();
    const pool = await getPool();

    // RETURNING with the same cast so the created row comes back as numbers
    const result = await pool.query<Product>(
      `INSERT INTO products (id, name, category, price, stock)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${PRODUCT_COLS}`,
      [id, name.trim(), category.trim(), price, stock]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /api/products error:", err);
    res.status(500).json({ error: "Failed to create product." });
  }
});

export default router;
