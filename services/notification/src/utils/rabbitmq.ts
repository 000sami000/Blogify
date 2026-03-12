import amqp from "amqplib";
import Notification, { NotificationType } from "../model/Notification.js";

interface NotificationEventMessage {
  type: NotificationType;
  recipientUserId: string;
  actorUserId: string;
  actorName?: string;
  blogId?: number;
  commentId?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

const QUEUE_NAME = process.env.NOTIFICATION_EVENTS_QUEUE || "notification-events";
const RECONNECT_DELAY_MS = Number(
  process.env.RABBITMQ_RECONNECT_DELAY_MS || 5000
);

let connection: amqp.ChannelModel | null = null;
let channel: amqp.Channel | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connecting = false;
let shouldConsume = false;

const maybeUnrefTimer = (timer: ReturnType<typeof setTimeout>) => {
  if (
    typeof timer === "object" &&
    timer !== null &&
    "unref" in timer &&
    typeof timer.unref === "function"
  ) {
    timer.unref();
  }
};

const safeAck = (consumerChannel: amqp.Channel, msg: amqp.ConsumeMessage) => {
  try {
    consumerChannel.ack(msg);
  } catch (error) {
    console.error("Notification consumer ack failed:", error);
  }
};

const safeNack = (consumerChannel: amqp.Channel, msg: amqp.ConsumeMessage) => {
  try {
    consumerChannel.nack(msg, false, true);
  } catch (error) {
    console.error("Notification consumer nack failed:", error);
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

  if (reconnectTimer) {
    maybeUnrefTimer(reconnectTimer);
  }
};

const buildMessage = (event: NotificationEventMessage) => {
  const actorLabel = event.actorName?.trim() || "Someone";
  const defaultMessage =
    event.type === "blog_comment"
      ? `${actorLabel} commented on your blog`
      : event.type === "profile_star"
        ? `${actorLabel} starred your profile`
        : `${actorLabel} liked your blog`;

  return {
    message: event.message?.trim() || defaultMessage,
    metadata: event.metadata || {},
  };
};

const saveNotificationEvent = async (event: NotificationEventMessage) => {
  if (
    !event.type ||
    !event.recipientUserId ||
    !event.actorUserId ||
    event.recipientUserId === event.actorUserId
  ) {
    return;
  }

  const normalizedType: NotificationType =
    event.type === "blog_comment"
      ? "blog_comment"
      : event.type === "profile_star"
        ? "profile_star"
        : "blog_like";
  const built = buildMessage(event);

  await Notification.create({
    recipientUserId: String(event.recipientUserId),
    actorUserId: String(event.actorUserId),
    actorName: event.actorName?.trim() || "",
    type: normalizedType,
    blogId: Number.isFinite(event.blogId) ? Number(event.blogId) : undefined,
    commentId: event.commentId ? String(event.commentId) : "",
    message: built.message,
    metadata: built.metadata,
    isRead: false,
    createdAt: event.createdAt ? new Date(event.createdAt) : undefined,
  });
};

const connectAndConsume = async () => {
  if (connecting || !shouldConsume || channel) {
    return;
  }

  connecting = true;
  try {
    const nextConnection = await amqp.connect({
      protocol: "amqp",
      hostname: process.env.Rabbimq_Host || "localhost",
      port: Number(process.env.Rabbitmq_Port || 5672),
      username: process.env.Rabbimq_Username || "guest",
      password: process.env.Rabbimq_Password || "guest",
      heartbeat: Number(process.env.RABBITMQ_HEARTBEAT_SECONDS || 30),
    });

    nextConnection.on("error", (error) => {
      console.error("Notification rabbitmq connection error:", error);
    });

    nextConnection.on("close", () => {
      console.error("Notification rabbitmq connection closed. Reconnecting...");
      connection = null;
      channel = null;
      scheduleReconnect();
    });

    const nextChannel = await nextConnection.createChannel();
    nextChannel.on("error", (error) => {
      console.error("Notification rabbitmq channel error:", error);
    });
    nextChannel.on("close", () => {
      console.error("Notification rabbitmq channel closed. Reconnecting...");
      channel = null;
      scheduleReconnect();
    });

    await nextChannel.assertQueue(QUEUE_NAME, { durable: true });
    await nextChannel.prefetch(200);

    await nextChannel.consume(QUEUE_NAME, async (msg) => {
      if (!msg) {
        return;
      }

      try {
        const content = JSON.parse(msg.content.toString()) as NotificationEventMessage;
        await saveNotificationEvent(content);
        safeAck(nextChannel, msg);
      } catch (error) {
        console.error("Failed to process notification event:", error);
        safeNack(nextChannel, msg);
      }
    });

    connection = nextConnection;
    channel = nextChannel;
    console.log("Notification service consumer started");
  } catch (error) {
    console.error("Failed to connect notification consumer. Reconnecting:", error);
    scheduleReconnect();
  } finally {
    connecting = false;
  }
};

export const startNotificationConsumer = async () => {
  shouldConsume = true;
  await connectAndConsume();
};
