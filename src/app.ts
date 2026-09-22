import express from "express";
import cors from "cors";
import productRoutes from "./routes/products";
import orderRoutes from "./routes/orders";
import statsRoutes from "./routes/stats";
import authRoutes from "./routes/auth";
import { requireAuth, requireAdmin } from "./middleware/auth";
import { AuthenticatedRequest } from "./types";

export const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
const allowedOrigins = [
  "http://localhost:5173",
  process.env.FRONTEND_URL,
].filter((origin): origin is string => Boolean(origin));

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// ─── Route helpers ────────────────────────────────────────────────────────────
const authOnly = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => requireAuth(req as AuthenticatedRequest, res, next);

const adminOnly = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => requireAdmin(req as AuthenticatedRequest, res, next);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Public — no auth required
app.use("/api/auth", authRoutes);

// ── Products ─────────────────────────────────────────────────────────────────
// GET  /api/products     → any authenticated user
// GET  /api/products/:id → any authenticated user
// POST /api/products     → admin only
const productGuard = express.Router();
productGuard.get("/", authOnly);
productGuard.get("/:id", authOnly);
productGuard.post("/", authOnly, adminOnly);
app.use("/api/products", productGuard, productRoutes);

// ── Orders ────────────────────────────────────────────────────────────────────
app.use("/api/orders", authOnly, orderRoutes);

// ── Stats ─────────────────────────────────────────────────────────────────────
app.use("/api/stats", authOnly, adminOnly, statsRoutes);

// ─── 404 catch-all ───────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found." });
});
