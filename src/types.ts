// Shared TypeScript interfaces for the Inventory API
import { Request } from "express";

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
}

export interface Order {
  id: string;
  product_id: string;
  quantity: number;
  status: "confirmed" | "rejected";
  created_at: string;
}

// Order row returned from the JOIN query (includes product name)
export interface OrderWithProduct extends Order {
  product_name: string;
}

// Request body shapes
export interface CreateProductBody {
  name: string;
  category: string;
  price: number;
  stock: number;
}

export interface StatsResponse {
  totalProducts: number;
  lowStockCount: number;    // products where stock < 10
  totalOrders: number;
  confirmedOrders: number;
  rejectedOrders: number;
}

export interface CreateOrderBody {
  product_id: string;
  quantity: number;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export type UserRole = "admin" | "user";

/** Row shape as stored in the users table (password_hash never leaves the DB layer) */
export interface User {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
}

/** Safe public representation — never includes password_hash */
export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
}

/** POST /api/auth/register request body */
export interface RegisterRequest {
  email: string;
  password: string;
  role: UserRole;
}

/** POST /api/auth/login request body */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Payload encoded inside the JWT */
export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

/**
 * Express Request extended with the authenticated user info.
 * Set by requireAuth middleware after a valid JWT is verified.
 */
export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}
