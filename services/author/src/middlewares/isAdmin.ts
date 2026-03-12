import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "./isAuth.js";

export const isAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    res.status(401).json({
      message: "Unauthorized",
    });
    return;
  }

  if (req.user.role !== "admin") {
    res.status(403).json({
      message: "Admin access required",
    });
    return;
  }

  next();
};

