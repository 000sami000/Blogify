import mongoose from "mongoose";

const connectDb = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not defined in .env");
    }

    await mongoose.connect(process.env.MONGO_URI as string, {
      dbName: "user_db",           // optional if already in URI
      // these options are now defaults in Mongoose 7+
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
    });

    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1); // exit app if DB connection fails
  }
};

export default connectDb;
