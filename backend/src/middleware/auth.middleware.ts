import type { NextFunction, Request, Response } from "express";
import { supabase } from "../config/supabase.js";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
      };
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authorization = req.headers.authorization;

  if (!authorization) {
    res.status(401).json({ message: "Missing Authorization header" });
    return;
  }

  const match = authorization.match(/^Bearer\s+(\S+)$/i);

  if (!match) {
    res.status(401).json({ message: "Invalid Authorization header" });
    return;
  }

  const accessToken = match[1];

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    res.status(401).json({ message: "Invalid or expired token" });
    return;
  }

  req.user = {
    id: user.id,
  };

  next();
}