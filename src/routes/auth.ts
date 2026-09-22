import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { getPool } from "../db";
import {
  User,
  PublicUser,
  RegisterRequest,
  LoginRequest,
  JwtPayload,
  UserRole,
} from "../types";

const router = Router();

const SALT_ROUNDS = 12;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES: UserRole[] = ["admin", "user"];

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set.");
  return secret;
}

// ─── POST /api/auth/register ──────────────────────────────────────────────────
router.post(
  "/register",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password, role } = req.body as RegisterRequest;

      // ── Validation ────────────────────────────────────────────────────────
      if (!email || !password || !role) {
        res
          .status(400)
          .json({ error: "email, password, and role are all required." });
        return;
      }

      if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
        res.status(400).json({ error: "A valid email address is required." });
        return;
      }

      if (typeof password !== "string" || password.length < 6) {
        res
          .status(400)
          .json({ error: "password must be at least 6 characters." });
        return;
      }

      if (!VALID_ROLES.includes(role)) {
        res
          .status(400)
          .json({ error: "role must be exactly 'admin' or 'user'." });
        return;
      }
      // ──────────────────────────────────────────────────────────────────────

      const pool = await getPool();
      const normalizedEmail = email.trim().toLowerCase();

      // Check for duplicate email before hashing (cheap read first)
      const existing = await pool.query<{ id: string }>(
        "SELECT id FROM users WHERE email = $1",
        [normalizedEmail]
      );

      if (existing.rows.length > 0) {
        res.status(400).json({ error: "Email is already registered." });
        return;
      }

      const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
      const id = uuidv4();

      // RETURNING id,email,role avoids a second SELECT and never exposes
      // password_hash (we only SELECT the columns we need).
      await pool.query(
        `INSERT INTO users (id, email, password_hash, role)
         VALUES ($1, $2, $3, $4)`,
        [id, normalizedEmail, password_hash, role]
      );

      const publicUser: PublicUser = { id, email: normalizedEmail, role };
      res.status(201).json({ user: publicUser });
    } catch (err) {
      console.error("POST /api/auth/register error:", err);
      res.status(500).json({ error: "Registration failed." });
    }
  }
);

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body as LoginRequest;

    if (!email || !password) {
      res.status(400).json({ error: "email and password are both required." });
      return;
    }

    if (typeof email !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "email and password must be strings." });
      return;
    }

    const pool = await getPool();
    const normalizedEmail = email.trim().toLowerCase();

    const result = await pool.query<User>(
      "SELECT * FROM users WHERE email = $1",
      [normalizedEmail]
    );

    const user = result.rows[0] ?? null;

    // Run bcrypt even when the user doesn't exist to prevent timing-based
    // user enumeration (valid email path takes ~same time as invalid email).
    const DUMMY_HASH =
      "$2b$12$invalidhashforcomparisononlyXXXXXXXXXXXXXXXXXXXXXXXX";
    const hashToCompare = user ? user.password_hash : DUMMY_HASH;
    const passwordMatch = await bcrypt.compare(password, hashToCompare);

    if (!user || !passwordMatch) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const token = jwt.sign(payload, getJwtSecret(), { expiresIn: "24h" });

    const publicUser: PublicUser = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    res.status(200).json({ token, user: publicUser });
  } catch (err) {
    console.error("POST /api/auth/login error:", err);
    res.status(500).json({ error: "Login failed." });
  }
});

export default router;
