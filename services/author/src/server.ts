import "reflect-metadata";
import express from "express";
import dotenv from "dotenv";
import blogRoutes from "./routes/blog.js";
import { v2 as cloudinary } from "cloudinary";
import { connectRabbitMQ } from "./utils/rabbitmq.js";
import cors from "cors";
import { initDb } from "./utils/db.js";
import morgan from "morgan";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.Cloud_Name,
  api_key: process.env.Cloud_Api_Key,
  api_secret: process.env.Cloud_Api_Secret,
});

const app = express();
app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

const port = process.env.PORT;



const startServer = async () => {
  await initDb();
  console.log("Connected to database");

  await connectRabbitMQ();

  app.use("/api/v1", blogRoutes);

  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start author service:", error);
  process.exit(1);
});
