import dotenv from "dotenv";
import { DataSource } from "typeorm";
import { Blog } from "../entities/Blog.js";
import { BlogLike } from "../entities/BlogLike.js";
import { BlogReport } from "../entities/BlogReport.js";
import { BlogViewStat } from "../entities/BlogViewStat.js";
import { SavedBlog } from "../entities/SavedBlog.js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const dbUrl = process.env.DB_URL;

const sslEnabled =
  process.env.DB_SSL === "true" || (dbUrl?.includes("sslmode=require") ?? false);

const ssl = sslEnabled ? { rejectUnauthorized: false } : false;
const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const isDistRuntime = currentDir.includes(`${path.sep}dist${path.sep}`);
const migrationsPath = isDistRuntime
  ? path.resolve(currentDir, "../migrations/*.{js,cjs,mjs}")
  : path.resolve(currentDir, "../migrations/*.ts");

export const AppDataSource = new DataSource({
  type: "postgres",
  url: dbUrl,
  ssl,
  synchronize: process.env.TYPEORM_SYNC === "true",
  logging: process.env.TYPEORM_LOGGING === "true",
  entities: [Blog, SavedBlog, BlogLike, BlogReport, BlogViewStat],
  migrations: [migrationsPath],
});

export const initDb = async () => {
  if (!dbUrl) {
    throw new Error("DB_URL is not set");
  }

  if (AppDataSource.isInitialized) {
    return AppDataSource;
  }

  return AppDataSource.initialize();
};
