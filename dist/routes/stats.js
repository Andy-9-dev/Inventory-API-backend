"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const router = (0, express_1.Router)();
// ─── GET /api/stats ───────────────────────────────────────────────────────────
// Returns aggregate counts across products and orders.
// All values are computed with SQL — no hardcoded numbers.
router.get("/", async (_req, res) => {
    try {
        const db = await (0, db_1.getDb)();
        // Run all five aggregations in parallel for efficiency
        const [productsRow, lowStockRow, totalOrdersRow, confirmedRow, rejectedRow,] = await Promise.all([
            db.get("SELECT COUNT(*) AS count FROM products"),
            db.get("SELECT COUNT(*) AS count FROM products WHERE stock < 10"),
            db.get("SELECT COUNT(*) AS count FROM orders"),
            db.get("SELECT COUNT(*) AS count FROM orders WHERE status = 'confirmed'"),
            db.get("SELECT COUNT(*) AS count FROM orders WHERE status = 'rejected'"),
        ]);
        const stats = {
            totalProducts: productsRow?.count ?? 0,
            lowStockCount: lowStockRow?.count ?? 0,
            totalOrders: totalOrdersRow?.count ?? 0,
            confirmedOrders: confirmedRow?.count ?? 0,
            rejectedOrders: rejectedRow?.count ?? 0,
        };
        res.json(stats);
    }
    catch (err) {
        console.error("GET /api/stats error:", err);
        res.status(500).json({ error: "Failed to retrieve stats." });
    }
});
exports.default = router;
