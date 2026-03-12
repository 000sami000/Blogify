import mongoose from "mongoose";

export const connectDb = async () => {
  const mongoUri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME || "notification_db";
  const maxPoolSize = Number(process.env.MONGO_MAX_POOL_SIZE || 50);
  const minPoolSize = Number(process.env.MONGO_MIN_POOL_SIZE || 5);

  if (!mongoUri) {
    throw new Error("MONGO_URI is not defined in .env");
  }

  await mongoose.connect(mongoUri, {
    dbName,
    maxPoolSize,
    minPoolSize,
  });
  console.log("Connected to MongoDB");
};
