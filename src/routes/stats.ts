import { Router, Request, Response } from "express";
import { getPool } from "../db";
import { StatsResponse } from "../types";

const router = Router();

// ─── GET /api/stats ───────────────────────────────────────────────────────────
// Returns aggregate counts across products and orders.
//
// Postgres note: COUNT(*) returns a BIGINT, which pg sends as a string to
// avoid JS number overflow.  We cast to INT in SQL so the JSON response
// contains actual numbers, matching the StatsResponse interface.
router.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const pool = await getPool();

    // Single query with conditional aggregation — one round-trip instead of five.
    const result = await pool.query<{
      total_products:   string;
      low_stock_count:  string;
      total_orders:     string;
      confirmed_orders: string;
      rejected_orders:  string;
    }>(`
      SELECT
        COUNT(*)::int                                          AS total_products,
        COUNT(*) FILTER (WHERE stock < 10)::int               AS low_stock_count,
        (SELECT COUNT(*)::int FROM orders)                     AS total_orders,
        (SELECT COUNT(*)::int FROM orders WHERE status = 'confirmed') AS confirmed_orders,
        (SELECT COUNT(*)::int FROM orders WHERE status = 'rejected')  AS rejected_orders
      FROM products
    `);

    const row = result.rows[0];

    const stats: StatsResponse = {
      totalProducts:   Number(row.total_products),
      lowStockCount:   Number(row.low_stock_count),
      totalOrders:     Number(row.total_orders),
      confirmedOrders: Number(row.confirmed_orders),
      rejectedOrders:  Number(row.rejected_orders),
    };

    res.json(stats);
  } catch (err) {
    console.error("GET /api/stats error:", err);
    res.status(500).json({ error: "Failed to retrieve stats." });
  }
});

export default router;
