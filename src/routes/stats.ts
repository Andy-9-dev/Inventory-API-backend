import { Router, Request, Response } from "express";
import { getDb } from "../db";
import { StatsResponse } from "../types";

const router = Router();

// ─── GET /api/stats ───────────────────────────────────────────────────────────
// Returns aggregate counts across products and orders.
// All values are computed with SQL — no hardcoded numbers.
router.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDb();

    // Run all five aggregations in parallel for efficiency
    const [
      productsRow,
      lowStockRow,
      totalOrdersRow,
      confirmedRow,
      rejectedRow,
    ] = await Promise.all([
      db.get<{ count: number }>("SELECT COUNT(*) AS count FROM products"),
      db.get<{ count: number }>(
        "SELECT COUNT(*) AS count FROM products WHERE stock < 10"
      ),
      db.get<{ count: number }>("SELECT COUNT(*) AS count FROM orders"),
      db.get<{ count: number }>(
        "SELECT COUNT(*) AS count FROM orders WHERE status = 'confirmed'"
      ),
      db.get<{ count: number }>(
        "SELECT COUNT(*) AS count FROM orders WHERE status = 'rejected'"
      ),
    ]);

    const stats: StatsResponse = {
      totalProducts:   productsRow?.count    ?? 0,
      lowStockCount:   lowStockRow?.count    ?? 0,
      totalOrders:     totalOrdersRow?.count ?? 0,
      confirmedOrders: confirmedRow?.count   ?? 0,
      rejectedOrders:  rejectedRow?.count    ?? 0,
    };

    res.json(stats);
  } catch (err) {
    console.error("GET /api/stats error:", err);
    res.status(500).json({ error: "Failed to retrieve stats." });
  }
});

export default router;
