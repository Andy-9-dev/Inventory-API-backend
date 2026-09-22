/**
 * tests/orders.test.ts
 *
 * Tests for POST /api/orders and GET /api/orders.
 *
 * The most important tests here are the stock confirmation/rejection cases.
 * They don't just check the response — they re-query the product afterward
 * to verify that stock was (or was NOT) modified in the database.
 */

import {
  initTestDb,
  teardownTestDb,
  request,
  createAndLoginUser,
  bearerToken,
} from "./setup";
import type { TestUserCredentials } from "./setup";
import type { Product } from "../src/types";

process.env.JWT_SECRET = "test-secret-for-jest-only-do-not-use-in-production";

let userToken: string;
let adminToken: string;

// A product created fresh before each describe block so tests don't trip over
// each other's stock changes
let testProductId: string;
const INITIAL_STOCK = 20;

beforeAll(async () => {
  await initTestDb();

  const admin: TestUserCredentials = await createAndLoginUser(
    "admin@orders.test",
    "adminpass",
    "admin"
  );
  const user: TestUserCredentials = await createAndLoginUser(
    "user@orders.test",
    "userpass",
    "user"
  );

  adminToken = admin.token;
  userToken = user.token;
});

afterAll(async () => {
  await teardownTestDb();
});

/** Helper: creates a fresh product via the API and returns its id */
async function createTestProduct(stock: number = INITIAL_STOCK): Promise<string> {
  const res = await request
    .post("/api/products")
    .set("Authorization", bearerToken(adminToken))
    .send({
      name: "Order Test Product",
      category: "Test",
      price: 10.0,
      stock,
    })
    .expect(201);

  return res.body.id as string;
}

/** Helper: fetches a product by id and returns it (includes current stock) */
async function getProduct(id: string): Promise<Product> {
  const res = await request
    .get(`/api/products/${id}`)
    .set("Authorization", bearerToken(userToken))
    .expect(200);

  return res.body as Product;
}

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/orders", () => {
  // Create a fresh product before each test in this describe block so stock
  // is always at INITIAL_STOCK and tests don't interfere with each other
  beforeEach(async () => {
    testProductId = await createTestProduct(INITIAL_STOCK);
  });

  // ── Auth guard ───────────────────────────────────────────────────────────────
  it("returns 401 when no token is provided", async () => {
    const res = await request
      .post("/api/orders")
      .send({ product_id: testProductId, quantity: 1 });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  // ── CONFIRMED order: stock deducted ─────────────────────────────────────────
  it("confirms an order and correctly decrements stock when quantity is within available stock", async () => {
    const orderQuantity = 5;

    // Verify stock BEFORE placing the order
    const productBefore = await getProduct(testProductId);
    expect(productBefore.stock).toBe(INITIAL_STOCK);

    const res = await request
      .post("/api/orders")
      .set("Authorization", bearerToken(userToken))
      .send({ product_id: testProductId, quantity: orderQuantity });

    // Confirmed orders return 201
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("status", "confirmed");
    expect(res.body).toHaveProperty("id");
    expect(res.body.product_id).toBe(testProductId);
    expect(res.body.quantity).toBe(orderQuantity);

    // ── Critical assertion: verify the database was actually updated ──────────
    const productAfter = await getProduct(testProductId);
    expect(productAfter.stock).toBe(INITIAL_STOCK - orderQuantity);
  });

  // ── REJECTED order: stock untouched ─────────────────────────────────────────
  it("rejects an order and leaves stock UNCHANGED when quantity exceeds available stock", async () => {
    const excessQuantity = INITIAL_STOCK + 999; // way more than we have

    // Verify stock BEFORE placing the order
    const productBefore = await getProduct(testProductId);
    const stockBefore = productBefore.stock;
    expect(stockBefore).toBe(INITIAL_STOCK);

    const res = await request
      .post("/api/orders")
      .set("Authorization", bearerToken(userToken))
      .send({ product_id: testProductId, quantity: excessQuantity });

    // Rejected orders return 200 (not 201) with a message
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("order");
    expect(res.body.order).toHaveProperty("status", "rejected");
    expect(res.body.order.quantity).toBe(excessQuantity);

    // Must include a human-readable explanation
    expect(res.body).toHaveProperty("message");
    expect(typeof res.body.message).toBe("string");
    expect(res.body.message.length).toBeGreaterThan(0);

    // ── Critical assertion: stock must be IDENTICAL to what it was before ─────
    // This is the core business-logic guarantee: rejected orders never
    // deduct stock under any circumstances.
    const productAfter = await getProduct(testProductId);
    expect(productAfter.stock).toBe(stockBefore); // must not have changed
  });

  // ── Validation: quantity <= 0 ────────────────────────────────────────────────
  it("returns 400 when quantity is zero", async () => {
    const res = await request
      .post("/api/orders")
      .set("Authorization", bearerToken(userToken))
      .send({ product_id: testProductId, quantity: 0 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when quantity is negative", async () => {
    const res = await request
      .post("/api/orders")
      .set("Authorization", bearerToken(userToken))
      .send({ product_id: testProductId, quantity: -3 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  // ── Not found ────────────────────────────────────────────────────────────────
  it("returns 404 when product_id does not exist", async () => {
    const res = await request
      .post("/api/orders")
      .set("Authorization", bearerToken(userToken))
      .send({
        product_id: "00000000-0000-0000-0000-000000000000",
        quantity: 1,
      });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/orders", () => {
  // Create a product and place two orders before running the GET tests
  let ordersProductId: string;

  beforeAll(async () => {
    ordersProductId = await createTestProduct(100);

    // Place two orders so we have data to inspect
    await request
      .post("/api/orders")
      .set("Authorization", bearerToken(userToken))
      .send({ product_id: ordersProductId, quantity: 3 })
      .expect(201);

    await request
      .post("/api/orders")
      .set("Authorization", bearerToken(userToken))
      .send({ product_id: ordersProductId, quantity: 2 })
      .expect(201);
  });

  it("returns 401 when no token is provided", async () => {
    const res = await request.get("/api/orders");
    expect(res.status).toBe(401);
  });

  it("returns an array of orders that each include product_name, ordered newest-first", async () => {
    const res = await request
      .get("/api/orders")
      .set("Authorization", bearerToken(userToken));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);

    // Every order must include the joined product_name field
    for (const order of res.body) {
      expect(order).toHaveProperty("product_name");
      expect(typeof order.product_name).toBe("string");
      expect(order.product_name.length).toBeGreaterThan(0);

      // Core order fields must be present
      expect(order).toHaveProperty("id");
      expect(order).toHaveProperty("product_id");
      expect(order).toHaveProperty("quantity");
      expect(order).toHaveProperty("status");
      expect(order).toHaveProperty("created_at");
    }

    // Verify newest-first ordering: the first item's created_at must be >=
    // the last item's created_at
    const timestamps = res.body.map((o: { created_at: string }) => o.created_at);
    for (let i = 0; i < timestamps.length - 1; i++) {
      expect(timestamps[i] >= timestamps[i + 1]).toBe(true);
    }
  });
});
