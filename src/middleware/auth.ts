import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface AuthenticatedRequest extends Request {
  tenantId: string;
}

export const tenantAuth = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ error: "Missing authorization token" });
    return;
  }
  try {
    const payload = jwt.verify(token, env.jwtSecret) as { tenantId: string };
    (req as AuthenticatedRequest).tenantId = payload.tenantId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};
