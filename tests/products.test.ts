/**
 * tests/products.test.ts
 *
 * Tests for GET /api/products, GET /api/products/:id, POST /api/products.
 * Covers authentication guards, role-based access control, and input validation.
 */

import {
  initTestDb,
  teardownTestDb,
  request,
  createAndLoginUser,
  bearerToken,
} from "./setup";
import type { TestUserCredentials } from "./setup";

process.env.JWT_SECRET = "test-secret-for-jest-only-do-not-use-in-production";

let adminToken: string;
let userToken: string;

beforeAll(async () => {
  await initTestDb();

  // Create one admin and one regular user — tokens reused across tests
  const admin: TestUserCredentials = await createAndLoginUser(
    "admin@products.test",
    "adminpass",
    "admin"
  );
  const user: TestUserCredentials = await createAndLoginUser(
    "user@products.test",
    "userpass",
    "user"
  );

  adminToken = admin.token;
  userToken = user.token;
});

afterAll(async () => {
  await teardownTestDb();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/products", () => {
  it("returns 401 when no token is provided", async () => {
    const res = await request.get("/api/products");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 200 and an array when a valid token (any role) is provided", async () => {
    const res = await request
      .get("/api/products")
      .set("Authorization", bearerToken(userToken));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/products", () => {
  const validProduct = {
    name: "Test Widget",
    category: "Electronics",
    price: 29.99,
    stock: 100,
  };

  it("returns 401 when no token is provided", async () => {
    const res = await request.post("/api/products").send(validProduct);
    expect(res.status).toBe(401);
  });

  it("returns 403 when a valid 'user' role token is used (not admin)", async () => {
    const res = await request
      .post("/api/products")
      .set("Authorization", bearerToken(userToken))
      .send(validProduct);

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toMatch(/admin/i);
  });

  it("returns 201 and the created product when a valid admin token is used", async () => {
    const res = await request
      .post("/api/products")
      .set("Authorization", bearerToken(adminToken))
      .send(validProduct);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "Test Widget",
      category: "Electronics",
      price: 29.99,
      stock: 100,
    });
    // Must have a UUID id assigned
    expect(res.body).toHaveProperty("id");
    expect(typeof res.body.id).toBe("string");
    expect(res.body.id.length).toBeGreaterThan(0);
  });

  it("returns 400 when required fields are missing", async () => {
    // Omit category intentionally
    const res = await request
      .post("/api/products")
      .set("Authorization", bearerToken(adminToken))
      .send({ name: "Incomplete", price: 5.0 }); // missing category and stock

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when price is negative", async () => {
    const res = await request
      .post("/api/products")
      .set("Authorization", bearerToken(adminToken))
      .send({ name: "Bad Price", category: "Tools", price: -1, stock: 10 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toMatch(/price/i);
  });

  it("returns 400 when stock is negative", async () => {
    const res = await request
      .post("/api/products")
      .set("Authorization", bearerToken(adminToken))
      .send({ name: "Bad Stock", category: "Tools", price: 5, stock: -5 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toMatch(/stock/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/products/:id", () => {
  it("returns 404 for a non-existent product id", async () => {
    const res = await request
      .get("/api/products/00000000-0000-0000-0000-000000000000")
      .set("Authorization", bearerToken(userToken));

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});
