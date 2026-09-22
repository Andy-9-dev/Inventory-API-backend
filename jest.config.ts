import type { Config } from "jest";

const config: Config = {
  // Use ts-jest to transpile TypeScript test files
  preset: "ts-jest",

  // Node environment — we're testing an Express API, not a browser app
  testEnvironment: "node",

  // Point ts-jest at the test-specific tsconfig so it can find both
  // src/ and tests/ without violating the main tsconfig's rootDir constraint
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.test.json",
      },
    ],
  },

  // Runs before each test suite in the worker process.
  // Loads .env so DATABASE_URL and JWT_SECRET are available — src/index.ts
  // is never executed in tests, so dotenv must be bootstrapped here.
  setupFiles: ["./tests/jest.setup.ts"],

  // Only pick up files inside the tests/ directory
  testMatch: ["**/tests/**/*.test.ts"],

  // Show individual test names in output (not just pass/fail counts)
  verbose: true,

  // Force Jest to exit after all tests complete — prevents open pg pool
  // connections from keeping the process alive
  forceExit: true,

  // Extend timeout to 15 s — bcrypt hashing during auth tests is intentionally
  // slow (salt rounds = 12) and can push past the default 5 s on slow CI
  testTimeout: 15000,
};

export default config;
