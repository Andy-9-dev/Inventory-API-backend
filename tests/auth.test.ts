/**
 * tests/auth.test.ts
 *
 * Tests for POST /api/auth/register and POST /api/auth/login.
 * Each test file gets its own fresh in-memory database — no shared state
 * with other test files and no contact with the real inventory.db.
 */

import { initTestDb, teardownTestDb, request } from "./setup";

// JWT_SECRET must be set before the app processes any request that touches JWTs
process.env.JWT_SECRET = "test-secret-for-jest-only-do-not-use-in-production";

beforeAll(async () => {
  await initTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/auth/register", () => {
  // ── Happy path ──────────────────────────────────────────────────────────────
  it("returns 201 and the new user (without password_hash) when given valid data", async () => {
    const res = await request.post("/api/auth/register").send({
      email: "alice@example.com",
      password: "securepass",
      role: "admin",
    });

    expect(res.status).toBe(201);

    // Must return user object nested under "user" key
    expect(res.body).toHaveProperty("user");
    const user = res.body.user;

    expect(user).toHaveProperty("id");
    expect(user.email).toBe("alice@example.com");
    expect(user.role).toBe("admin");

    // The single most important security assertion: password_hash must NEVER
    // appear anywhere in the response body
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash/);
    expect(JSON.stringify(res.body)).not.toMatch(/\$2b\$/); // bcrypt hash prefix
  });

  // ── Duplicate email ─────────────────────────────────────────────────────────
  it("returns 400 when the email is already registered", async () => {
    // Register once
    await request.post("/api/auth/register").send({
      email: "bob@example.com",
      password: "password123",
      role: "user",
    });

    // Attempt to register again with the same email
    const res = await request.post("/api/auth/register").send({
      email: "bob@example.com",
      password: "differentpassword",
      role: "user",
    });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toMatch(/already registered/i);
  });

  // ── Invalid role ────────────────────────────────────────────────────────────
  it("returns 400 when the role is not 'admin' or 'user'", async () => {
    const res = await request.post("/api/auth/register").send({
      email: "charlie@example.com",
      password: "password123",
      role: "superadmin",
    });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toMatch(/role/i);
  });

  // ── Short password ──────────────────────────────────────────────────────────
  it("returns 400 when the password is shorter than 6 characters", async () => {
    const res = await request.post("/api/auth/register").send({
      email: "dave@example.com",
      password: "abc",
      role: "user",
    });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toMatch(/password/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/auth/login", () => {
  // Register a known user before the login tests run
  beforeAll(async () => {
    await request.post("/api/auth/register").send({
      email: "eve@example.com",
      password: "correcthorsebattery",
      role: "user",
    });
  });

  // ── Happy path ──────────────────────────────────────────────────────────────
  it("returns 200, a JWT token, and safe user info when credentials are correct", async () => {
    const res = await request.post("/api/auth/login").send({
      email: "eve@example.com",
      password: "correcthorsebattery",
    });

    expect(res.status).toBe(200);

    // Must return both a token and a user object
    expect(res.body).toHaveProperty("token");
    expect(res.body).toHaveProperty("user");

    // Token must be a non-empty string (JWT format: three dot-separated segments)
    expect(typeof res.body.token).toBe("string");
    expect(res.body.token.split(".")).toHaveLength(3);

    // User info must be present and correct
    const user = res.body.user;
    expect(user.email).toBe("eve@example.com");
    expect(user.role).toBe("user");
    expect(user).toHaveProperty("id");

    // password_hash must not appear anywhere in the response
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash/);
  });

  // ── Wrong password ──────────────────────────────────────────────────────────
  it("returns 401 with a generic error message when the password is wrong", async () => {
    const res = await request.post("/api/auth/login").send({
      email: "eve@example.com",
      password: "wrongpassword",
    });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toBe("Invalid email or password.");
  });

  // ── Non-existent email ──────────────────────────────────────────────────────
  it("returns 401 with the SAME generic error message when the email doesn't exist", async () => {
    const res = await request.post("/api/auth/login").send({
      email: "nobody@example.com",
      password: "doesntmatter",
    });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");

    // Critically: the error message must be identical to the wrong-password
    // case — the API must not hint which field was incorrect
    expect(res.body.error).toBe("Invalid email or password.");
  });
});
