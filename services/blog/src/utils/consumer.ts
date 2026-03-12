import amqp from "amqplib";
import { redisClient } from "./redis.js";
import { AppDataSource } from "./db.js";
import { Blog } from "../entities/Blog.js";

interface CacheInvalidationMessage {
  action: string;
  keys: string[];
}

const QUEUE_NAME = "cache-invalidation";
const RECONNECT_DELAY_MS = Number(
  process.env.RABBITMQ_RECONNECT_DELAY_MS || 5000
);
const RABBITMQ_PREFETCH = Number(process.env.RABBITMQ_PREFETCH || 50);

let connection: amqp.ChannelModel | null = null;
let channel: amqp.Channel | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connecting = false;
let shouldConsume = false;

const buildConnectionOptions = () => ({
  protocol: "amqp" as const,
  hostname: process.env.Rabbimq_Host || "localhost",
  port: Number(process.env.Rabbitmq_Port || 5672),
  username: process.env.Rabbimq_Username || "guest",
  password: process.env.Rabbimq_Password || "guest",
  heartbeat: Number(process.env.RABBITMQ_HEARTBEAT_SECONDS || 30),
});

const safeAck = (consumerChannel: amqp.Channel, msg: amqp.ConsumeMessage) => {
  try {
    consumerChannel.ack(msg);
  } catch (error) {
    console.error("Blog cache consumer ack failed:", error);
  }
};

const safeNack = (consumerChannel: amqp.Channel, msg: amqp.ConsumeMessage) => {
  try {
    consumerChannel.nack(msg, false, true);
  } catch (error) {
    console.error("Blog cache consumer nack failed:", error);
  }
};

const scheduleReconnect = () => {
  if (reconnectTimer || connecting) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectAndConsume();
  }, RECONNECT_DELAY_MS);

  if (typeof reconnectTimer.unref === "function") {
    reconnectTimer.unref();
  }
};

const handleCacheInvalidation = async (content: CacheInvalidationMessage) => {
  if (content.action !== "invalidateCache") {
    return;
  }

  for (const pattern of content.keys) {
    const keys = await redisClient.keys(pattern);

    if (keys.length === 0) {
      continue;
    }

    await redisClient.del(keys);
    console.log(
      `Blog service invalidated ${keys.length} cache keys matching: ${pattern}`
    );

    // Rebuild the default blog feed cache after invalidation.
    const cacheKey = "blogs:v2::";
    const blogRepo = AppDataSource.getRepository(Blog);
    const blogs = await blogRepo.find({
      where: {
        publishStatus: "published",
        isActive: true,
      },
      order: { createAt: "DESC" },
    });

    await redisClient.set(cacheKey, JSON.stringify(blogs), {
      EX: 3600,
    });

    console.log("Blog cache rebuilt with key:", cacheKey);
  }
};

const connectAndConsume = async () => {
  if (connecting || !shouldConsume || channel) {
    return;
  }

  connecting = true;
  try {
    const nextConnection = await amqp.connect(buildConnectionOptions());

    nextConnection.on("error", (error) => {
      console.error("Blog rabbitmq connection error:", error);
    });

    nextConnection.on("close", () => {
      console.error("Blog rabbitmq connection closed. Reconnecting...");
      connection = null;
      channel = null;
      scheduleReconnect();
    });

    const nextChannel = await nextConnection.createChannel();
    nextChannel.on("error", (error) => {
      console.error("Blog rabbitmq channel error:", error);
    });
    nextChannel.on("close", () => {
      console.error("Blog rabbitmq channel closed. Reconnecting...");
      channel = null;
      scheduleReconnect();
    });

    await nextChannel.assertQueue(QUEUE_NAME, { durable: true });
    await nextChannel.prefetch(RABBITMQ_PREFETCH);

    await nextChannel.consume(QUEUE_NAME, async (msg) => {
      if (!msg) {
        return;
      }

      try {
        const content = JSON.parse(
          msg.content.toString()
        ) as CacheInvalidationMessage;

        await handleCacheInvalidation(content);
        safeAck(nextChannel, msg);
      } catch (error) {
        console.error(
          "Error processing cache invalidation in blog service:",
          error
        );
        safeNack(nextChannel, msg);
      }
    });

    connection = nextConnection;
    channel = nextChannel;
    console.log("Blog service cache consumer started");
  } catch (error) {
    console.error("Failed to start blog rabbitmq consumer, retrying:", error);
    scheduleReconnect();
  } finally {
    connecting = false;
  }
};

export const startCacheConsumer = async () => {
  shouldConsume = true;
  await connectAndConsume();
};
