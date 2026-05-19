import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Pool } from "pg";
import { env } from "../config/env";

export interface AuthenticatedRequest extends Request {
  tenantId: string;
}

export const createTenantAuth = (pool: Pool) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ error: "Missing authorization token" });
      return;
    }

    let payload: { sub: string; email?: string };
    try {
      payload = jwt.verify(token, env.supabaseJwtSecret) as { sub: string; email?: string };
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    // Auto-provision tenant on first login
    await pool.query(
      `INSERT INTO tenants (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
      [payload.sub, payload.email ?? payload.sub]
    );

    (req as AuthenticatedRequest).tenantId = payload.sub;
    next();
  };
