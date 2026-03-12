import { createClient } from "redis";

export const redisClient = createClient({
  url: process.env.REDIS_URL,
});

let hasRegisteredErrorHandler = false;
let connectPromise: Promise<unknown> | null = null;

export const connectRedis = async () => {
  if (!hasRegisteredErrorHandler) {
    hasRegisteredErrorHandler = true;
    redisClient.on("error", (error) => {
      console.error("Redis client error (blog service):", error);
    });
  }

  if (redisClient.isOpen) {
    return;
  }

  if (!connectPromise) {
    connectPromise = redisClient.connect().finally(() => {
      connectPromise = null;
    });
  }

  await connectPromise;
};
