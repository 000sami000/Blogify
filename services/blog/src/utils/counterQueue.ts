import amqp from "amqplib";

export interface CounterFlushJobMessage {
  blogId?: number;
  reason?: "view" | "like" | "manual";
  emittedAt: string;
}

export interface NotificationEventMessage {
  type: "blog_like" | "blog_comment";
  recipientUserId: string;
  actorUserId: string;
  actorName?: string;
  blogId?: number;
  commentId?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export const COUNTER_FLUSH_QUEUE_NAME =
  process.env.COUNTER_FLUSH_QUEUE || "blog-counter-flush";
export const NOTIFICATION_EVENTS_QUEUE_NAME =
  process.env.NOTIFICATION_EVENTS_QUEUE || "notification-events";

const RECONNECT_DELAY_MS = Number(
  process.env.RABBITMQ_RECONNECT_DELAY_MS || 5000
);

let publisherConnection: amqp.ChannelModel | null = null;
let publisherChannel: amqp.Channel | null = null;
let publisherConnecting = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const scheduleReconnect = () => {
  if (reconnectTimer || publisherConnecting) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectCounterFlushPublisher();
  }, RECONNECT_DELAY_MS);

  if (typeof reconnectTimer.unref === "function") {
    reconnectTimer.unref();
  }
};

const buildConnectionOptions = () => ({
  protocol: "amqp" as const,
  hostname: process.env.Rabbimq_Host || "localhost",
  port: Number(process.env.Rabbitmq_Port || 5672),
  username: process.env.Rabbimq_Username || "guest",
  password: process.env.Rabbimq_Password || "guest",
  heartbeat: Number(process.env.RABBITMQ_HEARTBEAT_SECONDS || 30),
});

export const connectCounterFlushPublisher = async () => {
  if (publisherConnecting || publisherChannel) {
    return;
  }

  publisherConnecting = true;
  try {
    const nextConnection = await amqp.connect(buildConnectionOptions());

    nextConnection.on("error", (error) => {
      console.error("Counter queue publisher connection error:", error);
    });

    nextConnection.on("close", () => {
      console.error("Counter queue publisher connection closed. Reconnecting...");
      publisherConnection = null;
      publisherChannel = null;
      scheduleReconnect();
    });

    const nextChannel = await nextConnection.createChannel();
    nextChannel.on("error", (error) => {
      console.error("Counter queue publisher channel error:", error);
    });
    nextChannel.on("close", () => {
      console.error("Counter queue publisher channel closed. Reconnecting...");
      publisherChannel = null;
      scheduleReconnect();
    });

    await nextChannel.assertQueue(COUNTER_FLUSH_QUEUE_NAME, {
      durable: true,
    });

    publisherConnection = nextConnection;
    publisherChannel = nextChannel;
    console.log("Counter queue publisher connected");
  } catch (error) {
    console.error("Failed to connect counter queue publisher:", error);
    scheduleReconnect();
  } finally {
    publisherConnecting = false;
  }
};

export const publishCounterFlushJob = async (message: CounterFlushJobMessage) => {
  if (!publisherChannel) {
    await connectCounterFlushPublisher();
  }

  if (!publisherChannel) {
    return false;
  }

  try {
    await publisherChannel.assertQueue(COUNTER_FLUSH_QUEUE_NAME, {
      durable: true,
    });

    publisherChannel.sendToQueue(
      COUNTER_FLUSH_QUEUE_NAME,
      Buffer.from(JSON.stringify(message)),
      { persistent: true }
    );

    return true;
  } catch (error) {
    console.error("Failed to publish counter flush job:", error);
    publisherChannel = null;
    scheduleReconnect();
    return false;
  }
};

export const publishNotificationEvent = async (
  message: NotificationEventMessage
) => {
  if (!publisherChannel) {
    await connectCounterFlushPublisher();
  }

  if (!publisherChannel) {
    return false;
  }

  try {
    await publisherChannel.assertQueue(NOTIFICATION_EVENTS_QUEUE_NAME, {
      durable: true,
    });

    publisherChannel.sendToQueue(
      NOTIFICATION_EVENTS_QUEUE_NAME,
      Buffer.from(JSON.stringify(message)),
      { persistent: true }
    );

    return true;
  } catch (error) {
    console.error("Failed to publish notification event:", error);
    publisherChannel = null;
    scheduleReconnect();
    return false;
  }
};
