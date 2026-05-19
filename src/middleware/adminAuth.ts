import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

export const adminAuth = (req: Request, res: Response, next: NextFunction): void => {
  const key = req.headers.authorization?.replace("Bearer ", "");
  if (key !== env.adminApiKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};
