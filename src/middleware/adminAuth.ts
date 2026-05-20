import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/verifyToken";

export const adminAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const payload = await verifyToken(token) as { app_metadata?: { role?: string } };
    if (payload.app_metadata?.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
};
