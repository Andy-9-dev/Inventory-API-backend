import "dotenv/config";
import { app } from "./app";
import { getDb } from "./db";

const PORT = process.env.PORT || 4001;

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
