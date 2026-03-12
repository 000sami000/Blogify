import { createRequire } from "module";
import path from "path";

type RedisSetOptions = {
  EX?: number;
  NX?: boolean;
};

type RedisMultiLike = {
  sAdd: (key: string, members: string | string[]) => RedisMultiLike;
  sRem: (key: string, members: string | string[]) => RedisMultiLike;
  hIncrBy: (key: string, field: string, increment: number) => RedisMultiLike;
  exec: () => Promise<unknown>;
};

type RedisClientLike = {
  isOpen?: boolean;
  connect: () => Promise<void>;
  set: (key: string, value: string, options?: RedisSetOptions) => Promise<string | null>;
  get: (key: string) => Promise<string | null>;
  hIncrBy: (key: string, field: string, increment: number) => Promise<number>;
  hGet: (key: string, field: string) => Promise<string | null>;
  sAdd: (key: string, members: string | string[]) => Promise<number>;
  sMembers: (key: string) => Promise<string[]>;
  sIsMember: (key: string, member: string) => Promise<boolean>;
  sRem: (key: string, members: string | string[]) => Promise<number>;
  del: (keys: string | string[]) => Promise<number>;
  multi: () => RedisMultiLike;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
};

type RedisCreateClient = (options: { url?: string }) => RedisClientLike;

const require = createRequire(import.meta.url);

let redisClient: RedisClientLike | null = null;
const localViewThrottle = new Map<string, number>();

const reserveLocalWindow = (key: string, ttlSeconds: number) => {
  const now = Date.now();
  const currentExpiry = localViewThrottle.get(key);

  if (typeof currentExpiry === "number" && currentExpiry > now) {
    return false;
  }

  localViewThrottle.set(key, now + ttlSeconds * 1000);

  if (localViewThrottle.size > 10_000) {
    for (const [entryKey, expiry] of localViewThrottle.entries()) {
      if (expiry <= now) {
        localViewThrottle.delete(entryKey);
      }
    }
  }

  return true;
};

const getRedisCreateClient = (): RedisCreateClient | null => {
  const moduleCandidates = [
    "redis",
    path.resolve(process.cwd(), "../comments/node_modules/redis"),
    path.resolve(process.cwd(), "../blog/node_modules/redis"),
  ];

  for (const modulePath of moduleCandidates) {
    try {
      const redisModule = require(modulePath) as { createClient?: RedisCreateClient };
      if (typeof redisModule?.createClient === "function") {
        return redisModule.createClient;
      }
    } catch {
      // Try next candidate module.
    }
  }

  return null;
};

export const initRedis = async () => {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn("REDIS_URL is not set, profile view rate limit is disabled");
    return null;
  }

  const createClient = getRedisCreateClient();
  if (!createClient) {
    console.warn("Redis package not found, profile view rate limit is disabled");
    return null;
  }

  redisClient = createClient({ url: redisUrl });
  redisClient.on?.("error", (error) => {
    console.error("Redis client error (user service):", error);
  });

  try {
    await redisClient.connect();
    console.log("Connected to redis (user service)");
    return redisClient;
  } catch (error) {
    console.error("Failed to connect redis, profile view rate limit is disabled:", error);
    redisClient = null;
    return null;
  }
};

export const getRedisClient = () => redisClient;

export const reserveProfileViewWindow = async (key: string, ttlSeconds: number) => {
  if (!redisClient?.isOpen) {
    return reserveLocalWindow(key, ttlSeconds);
  }

  try {
    const result = await redisClient.set(key, "1", {
      EX: ttlSeconds,
      NX: true,
    });
    return result === "OK";
  } catch (error) {
    console.error("Failed profile view rate-limit check, using local fallback:", error);
    return reserveLocalWindow(key, ttlSeconds);
  }
};
