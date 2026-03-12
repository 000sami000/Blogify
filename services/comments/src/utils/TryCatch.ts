import { NextFunction, Request, RequestHandler, Response } from "express";

const TryCatch = (handler: RequestHandler): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res, next);
    } catch (error: any) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
          ? error
          : "Internal server error";

      console.error(`[${req.method}] ${req.originalUrl}`, error);

      res.status(500).json({
        message: message || "Internal server error",
      });
    }
  };
};

export default TryCatch;
