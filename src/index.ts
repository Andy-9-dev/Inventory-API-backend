import express from "express";
import cors from "cors";
import { getDb } from "./db";
import productRoutes from "./routes/products";
import orderRoutes from "./routes/orders";
import statsRoutes from "./routes/stats";

const app = express();
const PORT = 4001;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: "http://localhost:5173", // Vite / frontend dev server
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/stats", statsRoutes);

// ─── 404 catch-all ───────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  try {
    // Initialise the database (creates tables if they don't exist)
    await getDb();

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();
