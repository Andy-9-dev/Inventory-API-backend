import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db";
import { Product, Order, OrderWithProduct, CreateOrderBody } from "../types";

const router = Router();

// ─── GET /api/orders ──────────────────────────────────────────────────────────
// Returns all orders with the related product name, newest first
router.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDb();
    const orders = await db.all<OrderWithProduct[]>(`
      SELECT
        o.id,
        o.product_id,
        o.quantity,
        o.status,
        o.created_at,
        p.name AS product_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      ORDER BY o.created_at DESC
    `);
    res.json(orders);
  } catch (err) {
    console.error("GET /api/orders error:", err);
    res.status(500).json({ error: "Failed to retrieve orders." });
  }
});

// ─── POST /api/orders ─────────────────────────────────────────────────────────
// Core business logic:
//   1. Validate input
//   2. Look up product — 404 if missing
//   3. Compare requested quantity against current stock
//      • Not enough stock  → save order as "rejected", return 200 + message
//      • Enough stock      → deduct stock, save order as "confirmed", return 201
//
// IMPORTANT: stock is ONLY deducted when the order is confirmed.
router.post("/", async (req: Request, res: Response): Promise<void> => {
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
      res
        .status(400)
        .json({ error: "product_id must be a non-empty string." });
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

    const db = await getDb();

    // ── Step 1: look up the product ──────────────────────────────────────────
    const product = await db.get<Product>(
      "SELECT * FROM products WHERE id = ?",
      product_id.trim()
    );

    if (!product) {
      res.status(404).json({ error: "Product not found." });
      return;
    }

    const orderId = uuidv4();

    // ── Step 2: stock check ──────────────────────────────────────────────────
    if (quantity > product.stock) {
      // Not enough stock — record a rejected order but do NOT touch stock
      await db.run(
        `INSERT INTO orders (id, product_id, quantity, status)
         VALUES (?, ?, ?, 'rejected')`,
        orderId,
        product.id,
        quantity
      );

      const rejectedOrder = await db.get<Order>(
        "SELECT * FROM orders WHERE id = ?",
        orderId
      );

      res.status(200).json({
        message: `Order rejected: requested ${quantity} unit(s) but only ${product.stock} in stock. No stock was deducted.`,
        order: rejectedOrder,
      });
      return;
    }

    // ── Step 3: enough stock — deduct and confirm ────────────────────────────
    // Deduct stock first; if this fails the INSERT below never runs
    await db.run(
      "UPDATE products SET stock = stock - ? WHERE id = ?",
      quantity,
      product.id
    );

    await db.run(
      `INSERT INTO orders (id, product_id, quantity, status)
       VALUES (?, ?, ?, 'confirmed')`,
      orderId,
      product.id,
      quantity
    );

    const confirmedOrder = await db.get<Order>(
      "SELECT * FROM orders WHERE id = ?",
      orderId
    );

    res.status(201).json(confirmedOrder);
  } catch (err) {
    console.error("POST /api/orders error:", err);
    res.status(500).json({ error: "Failed to create order." });
  }
});

export default router;
