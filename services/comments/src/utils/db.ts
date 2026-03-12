import mongoose from "mongoose";

export const connectDb = async () => {
  const mongoUri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME || "comments_db";

  if (!mongoUri) {
    throw new Error("MONGO_URI is not defined in .env");
  }

  await mongoose.connect(mongoUri, { dbName });
  console.log("Connected to MongoDB");
};
