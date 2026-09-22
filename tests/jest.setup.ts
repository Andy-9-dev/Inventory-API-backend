/**
 * tests/jest.setup.ts
 *
 * Runs before every test suite (via jest.config.ts `setupFiles`).
 * Loads the .env file so DATABASE_URL and JWT_SECRET are available
 * in the Jest worker process — src/index.ts is never executed in tests,
 * so dotenv must be bootstrapped here instead.
 */
import "dotenv/config";
