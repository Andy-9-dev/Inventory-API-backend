import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AuthenticatedRequest, JwtPayload } from "../types";

/** Reads JWT_SECRET or throws clearly if it's missing */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set.");
  }
  return secret;
}

// ─── requireAuth ──────────────────────────────────────────────────────────────
/**
 * Verifies the Bearer token in the Authorization header.
 * On success: attaches decoded user info to req.user and calls next().
 * On failure: returns 401.
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res
      .status(401)
      .json({ error: "Authorization header missing or malformed. Expected: Bearer <token>" });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload;
    req.user = decoded;
    next();
  } catch (err) {
    // Covers TokenExpiredError, JsonWebTokenError, NotBeforeError
    const message =
      err instanceof jwt.TokenExpiredError ? "Token has expired." : "Invalid token.";
    res.status(401).json({ error: message });
  }
}

// ─── requireAdmin ─────────────────────────────────────────────────────────────
/**
 * Must run AFTER requireAuth (relies on req.user being set).
 * Allows the request through only if the authenticated user's role is 'admin'.
 * Returns 403 Forbidden for any other role.
 */
export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (req.user?.role !== "admin") {
    res
      .status(403)
      .json({ error: "Forbidden: admin access required." });
    return;
  }
  next();
}
