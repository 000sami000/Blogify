import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import commentRoutes from "./routes/comment.js";
import { connectDb } from "./utils/db.js";
import morgan from "morgan";
import {
  connectRabbitMQ,
  startBlogEventsConsumer,
  startCommentCacheInvalidationConsumer,
} from "./utils/rabbitmq.js";
import { connectRedis, redisClient } from "./utils/redis.js";

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());
app.use(morgan("dev"));
app.use("/api/v1", commentRoutes);
app.get("/health", (_req, res) => {
  res.json({
    service: "comments",
    status: "ok",
    redisConnected: redisClient.isOpen,
  });
});

const port = process.env.PORT;

const startServer = async () => {
  await connectDb();

  try {
    await connectRedis();
    console.log("Connected to redis");
  } catch (error) {
    console.error("Failed to connect redis, comments service will continue without cache:", error);
  }

  try {
    await connectRabbitMQ();
    await startBlogEventsConsumer();
    await startCommentCacheInvalidationConsumer(redisClient);
  } catch (error) {
    console.error(
      "Failed to initialize RabbitMQ consumers, comments service will continue without async consumers:",
      error
    );
  }

  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start comments service:", error);
  process.exit(1);
});
