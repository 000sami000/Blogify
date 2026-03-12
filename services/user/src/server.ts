import express from "express";
import dotenv from "dotenv";
import connectDb from "./utils/db.js";
import userRoutes from "./routes/user.js";
import { v2 as cloudinary } from "cloudinary";
import cors from "cors";
import swaggerSpec from "./utils/swagger.js";
import swaggerUi from "swagger-ui-express";
import morgan from "morgan";
import { backfillUserDefaults } from "./utils/backfillUsers.js";
import { initRedis } from "./utils/redis.js";
import { connectNotificationPublisher } from "./utils/notificationQueue.js";
import { connectProfileVisitFlushPublisher } from "./utils/profileVisitQueue.js";
import { connectProfileStarFlushPublisher } from "./utils/profileStarQueue.js";
dotenv.config();

cloudinary.config({
  cloud_name: process.env.Cloud_Name,
  api_key: process.env.Cloud_Api_Key,
  api_secret: process.env.Cloud_Api_Secret,
});

const app = express();

app.set("trust proxy", true);
app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

app.use("/api/v1", userRoutes);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/docs.json", (_req, res) => res.json(swaggerSpec));
const port = process.env.PORT;

const startServer = async () => {
  await connectDb();
  await backfillUserDefaults();
  await initRedis();
  await connectNotificationPublisher();
  await connectProfileVisitFlushPublisher();
  await connectProfileStarFlushPublisher();

  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start user service:", error);
  process.exit(1);
});
