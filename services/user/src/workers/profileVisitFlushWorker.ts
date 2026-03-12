import dotenv from "dotenv";
import amqp from "amqplib";
import connectDb from "../utils/db.js";
import { initRedis } from "../utils/redis.js";
import { flushDirtyProfileVisitsNow } from "../utils/profileVisitCounters.js";
import {
  PROFILE_VISIT_FLUSH_QUEUE_NAME,
  ProfileVisitFlushJobMessage,
} from "../utils/profileVisitQueue.js";

dotenv.config();

const RECONNECT_DELAY_MS = Number(process.env.RABBITMQ_RECONNECT_DELAY_MS || 5000);
const DEBOUNCE_MS = Number(process.env.PROFILE_VISIT_WORKER_DEBOUNCE_MS || 750);
const PERIODIC_FLUSH_MS = Number(process.env.PROFILE_VISIT_WORKER_FLUSH_INTERVAL_MS || 10000);

let connection: amqp.ChannelModel | null = null;
let channel: amqp.Channel | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connecting = false;
let shouldConsume = false;

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingFlush = false;
let flushInFlight = false;

const buildConnectionOptions = () => ({
  protocol: "amqp" as const,
  hostname: process.env.Rabbimq_Host || "localhost",
  port: Number(process.env.Rabbitmq_Port || 5672),
  username: process.env.Rabbimq_Username || "guest",
  password: process.env.Rabbimq_Password || "guest",
  heartbeat: Number(process.env.RABBITMQ_HEARTBEAT_SECONDS || 30),
});

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

const flushNow = async () => {
  if (flushInFlight) {
    pendingFlush = true;
    return;
  }

  flushInFlight = true;
  try {
    await flushDirtyProfileVisitsNow();
  } catch (error) {
    console.error("Profile visit flush worker failed to flush counters:", error);
  } finally {
    flushInFlight = false;

    if (pendingFlush) {
      pendingFlush = false;
      scheduleFlush(100);
    }
  }
};

const scheduleFlush = (delayMs = DEBOUNCE_MS) => {
  if (flushTimer) {
    return;
  }

  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushNow();
  }, delayMs);

  if (typeof flushTimer.unref === "function") {
    flushTimer.unref();
  }
};

const safeAck = (consumerChannel: amqp.Channel, msg: amqp.ConsumeMessage) => {
  try {
    consumerChannel.ack(msg);
  } catch (error) {
    console.error("Profile visit flush worker ack failed:", error);
  }
};

const safeNack = (consumerChannel: amqp.Channel, msg: amqp.ConsumeMessage) => {
  try {
    consumerChannel.nack(msg, false, true);
  } catch (error) {
    console.error("Profile visit flush worker nack failed:", error);
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
      console.error("Profile visit flush worker connection error:", error);
    });

    nextConnection.on("close", () => {
      console.error("Profile visit flush worker connection closed. Reconnecting...");
      connection = null;
      channel = null;
      scheduleReconnect();
    });

    const nextChannel = await nextConnection.createChannel();
    nextChannel.on("error", (error) => {
      console.error("Profile visit flush worker channel error:", error);
    });
    nextChannel.on("close", () => {
      console.error("Profile visit flush worker channel closed. Reconnecting...");
      channel = null;
      scheduleReconnect();
    });

    await nextChannel.assertQueue(PROFILE_VISIT_FLUSH_QUEUE_NAME, {
      durable: true,
    });
    await nextChannel.prefetch(200);

    await nextChannel.consume(PROFILE_VISIT_FLUSH_QUEUE_NAME, async (msg) => {
      if (!msg) {
        return;
      }

      try {
        if (msg.content.length > 0) {
          JSON.parse(msg.content.toString()) as ProfileVisitFlushJobMessage;
        }
        scheduleFlush();
        safeAck(nextChannel, msg);
      } catch (error) {
        console.error("Profile visit flush worker failed to parse message:", error);
        safeNack(nextChannel, msg);
      }
    });

    connection = nextConnection;
    channel = nextChannel;
    console.log("Profile visit flush worker connected to queue:", PROFILE_VISIT_FLUSH_QUEUE_NAME);
  } catch (error) {
    console.error("Profile visit flush worker failed to connect. Reconnecting:", error);
    scheduleReconnect();
  } finally {
    connecting = false;
  }
};

const startWorker = async () => {
  await connectDb();
  console.log("Profile visit flush worker connected to database");

  await initRedis();
  console.log("Profile visit flush worker connected to redis");

  shouldConsume = true;
  await connectAndConsume();

  const timer = setInterval(() => {
    scheduleFlush(0);
  }, PERIODIC_FLUSH_MS);

  if (typeof timer.unref === "function") {
    timer.unref();
  }
};

startWorker().catch((error) => {
  console.error("Profile visit flush worker failed to start:", error);
  process.exit(1);
});
