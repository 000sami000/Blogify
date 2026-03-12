import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import notificationRoutes from "./routes/notification.js";
import { connectDb } from "./utils/db.js";
import { startNotificationConsumer } from "./utils/rabbitmq.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

app.use("/api/v1", notificationRoutes);
app.get("/health", (_req, res) => {
  res.json({
    service: "notification",
    status: "ok",
  });
});

const port = process.env.PORT;

const startServer = async () => {
  await connectDb();
  await startNotificationConsumer();

  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start notification service:", error);
  process.exit(1);
});

