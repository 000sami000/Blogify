import "reflect-metadata";
import express from "express";
import dotenv from "dotenv";
import blogRoutes from "./routes/blog.js";
import { startCacheConsumer } from "./utils/consumer.js";
import cors from "cors";
import { initDb } from "./utils/db.js";
import morgan from "morgan";
import { startCounterFlushWorker } from "./utils/counters.js";
import { connectCounterFlushPublisher } from "./utils/counterQueue.js";
import { connectRedis } from "./utils/redis.js";

dotenv.config();

const app = express();

app.set("trust proxy", true);

app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

const port = process.env.PORT;

  app.get("/", (req, res) => {
    res.send("Root works");
  });

const localFlushMode = (
  process.env.COUNTER_FLUSH_MODE || "queue"
).toLowerCase();

const startServer = async () => {
  await initDb();
  console.log("Connected to database");
  
  await connectRedis();
  console.log("Connected to redis");
  
  await connectCounterFlushPublisher();
  startCacheConsumer();
  if (localFlushMode === "local" || localFlushMode === "both") {
    startCounterFlushWorker();
    console.log("Started local counter flush worker");
  }
  
  
  app.use("/api/v1", blogRoutes);

  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start blog service:", error);
  process.exit(1);
});
