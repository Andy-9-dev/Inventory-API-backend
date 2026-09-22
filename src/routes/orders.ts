import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getPool } from "../db";
import { Product, Order, OrderWithProduct, CreateOrderBody } from "../types";

const router = Router();

// ─── GET /api/orders ──────────────────────────────────────────────────────────
// Returns all orders with the related product name, newest first.
// created_at is cast to TEXT so the response matches the Order interface (string).
router.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const pool = await getPool();
    const result = await pool.query<OrderWithProduct>(`
      SELECT
        o.id,
        o.product_id,
        o.quantity,
        o.status,
        o.created_at::text AS created_at,
        p.name             AS product_name
      FROM   orders   o
      JOIN   products p ON o.product_id = p.id
      ORDER  BY o.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/orders error:", err);
    res.status(500).json({ error: "Failed to retrieve orders." });
  }
});

// ─── POST /api/orders ─────────────────────────────────────────────────────────
// Business logic (unchanged from SQLite version):
//   1. Validate input
//   2. Look up product — 404 if missing
//   3a. quantity > stock  → INSERT rejected order, return 200 + message (no stock deduction)
//   3b. quantity ≤ stock  → UPDATE stock + INSERT confirmed order, return 201
//
// Postgres-specific addition: steps 3b UPDATE + INSERT are wrapped in an
// explicit transaction with SELECT ... FOR UPDATE to prevent a race condition
// where two concurrent requests both pass the stock check before either
// deducts.  On SQLite this was safe because all writes serialise on the file
// lock; on Postgres with a connection pool it is not.
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const pool = await getPool();
  const client = await pool.connect();

  try {
    const { product_id, quantity } = req.body as CreateOrderBody;

    // ── Validation ──────────────────────────────────────────────────────────
    if (product_id === undefined || quantity === undefined) {
      res
        .status(400)
        .json({ error: "product_id and quantity are both required." });
      return;
    }

    if (typeof product_id !== "string" || product_id.trim() === "") {
      res.status(400).json({ error: "product_id must be a non-empty string." });
      return;
    }

    if (
      typeof quantity !== "number" ||
      isNaN(quantity) ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      res
        .status(400)
        .json({ error: "quantity must be a positive integer greater than 0." });
      return;
    }
    // ────────────────────────────────────────────────────────────────────────

    await client.query("BEGIN");

    // Lock the product row for the duration of this transaction so concurrent
    // orders can't both pass the stock check before either deducts stock.
    const productResult = await client.query<Product>(
      "SELECT * FROM products WHERE id = $1 FOR UPDATE",
      [product_id.trim()]
    );

    if (productResult.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Product not found." });
      return;
    }

    const product = productResult.rows[0];
    const orderId = uuidv4();

    // ── Stock check ──────────────────────────────────────────────────────────
    if (quantity > product.stock) {
      // Not enough stock — record a rejected order, do NOT touch stock
      const insertResult = await client.query<Order>(
        `INSERT INTO orders (id, product_id, quantity, status)
         VALUES ($1, $2, $3, 'rejected')
         RETURNING id, product_id, quantity, status, created_at::text AS created_at`,
        [orderId, product.id, quantity]
      );

      await client.query("COMMIT");

      res.status(200).json({
        message: `Order rejected: requested ${quantity} unit(s) but only ${product.stock} in stock. No stock was deducted.`,
        order: insertResult.rows[0],
      });
      return;
    }

    // ── Enough stock — deduct and confirm ────────────────────────────────────
    await client.query(
      "UPDATE products SET stock = stock - $1 WHERE id = $2",
      [quantity, product.id]
    );

    const insertResult = await client.query<Order>(
      `INSERT INTO orders (id, product_id, quantity, status)
       VALUES ($1, $2, $3, 'confirmed')
       RETURNING id, product_id, quantity, status, created_at::text AS created_at`,
      [orderId, product.id, quantity]
    );

    await client.query("COMMIT");

    res.status(201).json(insertResult.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {
      // swallow rollback errors — original error is what matters
    });
    console.error("POST /api/orders error:", err);
    res.status(500).json({ error: "Failed to create order." });
  } finally {
    // Always release the client back to the pool, even on error
    client.release();
  }
});

export default router;
