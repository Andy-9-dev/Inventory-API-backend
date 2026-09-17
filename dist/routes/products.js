"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const uuid_1 = require("uuid");
const db_1 = require("../db");
const router = (0, express_1.Router)();
// ─── GET /api/products ────────────────────────────────────────────────────────
// Returns all products
router.get("/", async (_req, res) => {
    try {
        const db = await (0, db_1.getDb)();
        const products = await db.all("SELECT * FROM products");
        res.json(products);
    }
    catch (err) {
        console.error("GET /api/products error:", err);
        res.status(500).json({ error: "Failed to retrieve products." });
    }
});
// ─── GET /api/products/:id ────────────────────────────────────────────────────
// Returns a single product by id, or 404 if not found
router.get("/:id", async (req, res) => {
    try {
        const db = await (0, db_1.getDb)();
        const product = await db.get("SELECT * FROM products WHERE id = ?", req.params.id);
        if (!product) {
            res.status(404).json({ error: "Product not found." });
            return;
        }
        res.json(product);
    }
    catch (err) {
        console.error("GET /api/products/:id error:", err);
        res.status(500).json({ error: "Failed to retrieve product." });
    }
});
// ─── POST /api/products ───────────────────────────────────────────────────────
// Creates a new product; returns it with 201
router.post("/", async (req, res) => {
    try {
        const { name, category, price, stock } = req.body;
        // ── Validation ──────────────────────────────────────────────────────────
        if (name === undefined ||
            category === undefined ||
            price === undefined ||
            stock === undefined) {
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
            res
                .status(400)
                .json({ error: "price must be a non-negative number." });
            return;
        }
        if (typeof stock !== "number" ||
            isNaN(stock) ||
            stock < 0 ||
            !Number.isInteger(stock)) {
            res
                .status(400)
                .json({ error: "stock must be a non-negative integer." });
            return;
        }
        // ────────────────────────────────────────────────────────────────────────
        const id = (0, uuid_1.v4)();
        const trimmedName = name.trim();
        const trimmedCategory = category.trim();
        const db = await (0, db_1.getDb)();
        await db.run("INSERT INTO products (id, name, category, price, stock) VALUES (?, ?, ?, ?, ?)", id, trimmedName, trimmedCategory, price, stock);
        const created = await db.get("SELECT * FROM products WHERE id = ?", id);
        res.status(201).json(created);
    }
    catch (err) {
        console.error("POST /api/products error:", err);
        res.status(500).json({ error: "Failed to create product." });
    }
});
exports.default = router;
