declare module "morgan" {
  import { RequestHandler } from "express";

  type Format = "combined" | "common" | "dev" | "short" | "tiny" | string;

  function morgan(format: Format): RequestHandler;

  export default morgan;
}

