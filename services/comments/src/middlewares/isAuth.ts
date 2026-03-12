import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

interface IUser extends Document {
  _id: string;
  name: string;
  email: string;
  image: string;
  instagram: string;
  facebook: string;
  linkedin: string;
  bio: string;
  role?: "user" | "admin";
  isBanned?: boolean;
  isActive?: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: IUser | null;
}

export const isAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        message: "Please Login - No auth header",
      });
      return;
    }

    const token = authHeader.slice(7).trim();
    const tokenParts = token.split(".");

    if (
      !token ||
      token === "undefined" ||
      token === "null" ||
      tokenParts.length !== 3
    ) {
      res.status(401).json({
        message: "Invalid token format",
      });
      return;
    }

    const decodeValue = jwt.verify(
      token,
      process.env.JWT_SEC as string
    ) as JwtPayload;

    if (!decodeValue || !decodeValue.user) {
      res.status(401).json({
        message: "Invalid token",
      });
      return;
    }

    const user = decodeValue.user as IUser;

    if (user.isActive === false) {
      res.status(403).json({
        message: "Your account is inactive",
      });
      return;
    }

    if (user.isBanned === true) {
      res.status(403).json({
        message: "Your account is banned",
      });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    console.log("JWT verification failed");
    res.status(401).json({
      message: "Please Login - Jwt error",
    });
  }
};
