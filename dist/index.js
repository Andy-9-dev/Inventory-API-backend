"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const db_1 = require("./db");
const products_1 = __importDefault(require("./routes/products"));
const orders_1 = __importDefault(require("./routes/orders"));
const stats_1 = __importDefault(require("./routes/stats"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4001;
// ─── Middleware ───────────────────────────────────────────────────────────────
const allowedOrigins = [
    "http://localhost:5173", // local dev
    process.env.FRONTEND_URL, // deployed frontend (set this on Render)
].filter((origin) => Boolean(origin));
app.use((0, cors_1.default)({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type"],
}));
app.use(express_1.default.json());
// ─── Routes ───────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});
app.use("/api/products", products_1.default);
app.use("/api/orders", orders_1.default);
app.use("/api/stats", stats_1.default);
// ─── 404 catch-all ───────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ error: "Route not found." });
});
// ─── Start ────────────────────────────────────────────────────────────────────
async function start() {
    try {
        // Initialise the database (creates tables if they don't exist)
        await (0, db_1.getDb)();
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });
    }
    catch (err) {
        console.error("Failed to start server:", err);
        process.exit(1);
    }
}
start();
