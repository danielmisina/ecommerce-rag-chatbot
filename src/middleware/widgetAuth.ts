import { Request, Response, NextFunction } from "express";
import { Pool } from "pg";
import { AuthenticatedRequest } from "./auth";

export const createWidgetAuth = (pool: Pool) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.headers["x-widget-key"] as string | undefined;
    if (!key) {
      res.status(401).json({ error: "Missing X-Widget-Key header" });
      return;
    }
    const result = await pool.query<{ id: string }>(
      `SELECT id FROM tenants WHERE widget_key = $1`,
      [key]
    );
    if (!result.rows[0]) {
      res.status(401).json({ error: "Invalid widget key" });
      return;
    }
    (req as AuthenticatedRequest).tenantId = result.rows[0].id;
    next();
  };
