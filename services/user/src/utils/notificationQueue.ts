export interface NotificationEventMessage {
  type: "blog_like" | "blog_comment" | "profile_star";
  recipientUserId: string;
  actorUserId: string;
  actorName?: string;
  blogId?: number;
  commentId?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

const QUEUE_NAME = process.env.NOTIFICATION_EVENTS_QUEUE || "notification-events";
const RECONNECT_DELAY_MS = Number(
  process.env.RABBITMQ_RECONNECT_DELAY_MS || 5000
);

interface QueueConnection {
  on: (event: string, cb: (error?: unknown) => void) => void;
  createChannel: () => Promise<QueueChannel>;
}

interface QueueChannel {
  on: (event: string, cb: (error?: unknown) => void) => void;
  assertQueue: (queueName: string, options?: { durable?: boolean }) => Promise<unknown>;
  sendToQueue: (
    queueName: string,
    content: Buffer,
    options?: { persistent?: boolean }
  ) => boolean;
}

interface QueueModule {
  connect: (options: unknown) => Promise<QueueConnection>;
}

let publisherConnection: QueueConnection | null = null;
let publisherChannel: QueueChannel | null = null;
let publisherConnecting = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let moduleUnavailable = false;

let modulePromise: Promise<QueueModule | null> | null = null;

const loadAmqpModule = async (): Promise<QueueModule | null> => {
  if (moduleUnavailable) {
    return null;
  }

  if (!modulePromise) {
    modulePromise = (async () => {
      try {
        const moduleName = "amqplib";
        const loaded = await import(moduleName);
        return loaded.default as QueueModule;
      } catch (error) {
        moduleUnavailable = true;
        console.error(
          "User notification publisher disabled because amqplib is not installed in services/user.",
          error
        );
        return null;
      }
    })();
  }

  return modulePromise;
};

const buildConnectionOptions = () => ({
  protocol: "amqp" as const,
  hostname: process.env.Rabbimq_Host || "localhost",
  port: Number(process.env.Rabbitmq_Port || 5672),
  username: process.env.Rabbimq_Username || "guest",
  password: process.env.Rabbimq_Password || "guest",
  heartbeat: Number(process.env.RABBITMQ_HEARTBEAT_SECONDS || 30),
});

const scheduleReconnect = () => {
  if (moduleUnavailable || reconnectTimer || publisherConnecting) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectNotificationPublisher();
  }, RECONNECT_DELAY_MS);

  if (typeof reconnectTimer.unref === "function") {
    reconnectTimer.unref();
  }
};

export const connectNotificationPublisher = async () => {
  if (moduleUnavailable || publisherConnecting || publisherChannel) {
    return;
  }

  publisherConnecting = true;
  try {
    const amqpModule = await loadAmqpModule();
    if (!amqpModule) {
      return;
    }

    const nextConnection = await amqpModule.connect(buildConnectionOptions());

    nextConnection.on("error", (error: unknown) => {
      console.error("User notification publisher connection error:", error);
    });

    nextConnection.on("close", () => {
      console.error(
        "User notification publisher connection closed. Scheduling reconnect..."
      );
      publisherConnection = null;
      publisherChannel = null;
      scheduleReconnect();
    });

    const nextChannel = await nextConnection.createChannel();
    nextChannel.on("error", (error: unknown) => {
      console.error("User notification publisher channel error:", error);
    });
    nextChannel.on("close", () => {
      console.error(
        "User notification publisher channel closed. Scheduling reconnect..."
      );
      publisherChannel = null;
      scheduleReconnect();
    });

    await nextChannel.assertQueue(QUEUE_NAME, { durable: true });
    publisherConnection = nextConnection;
    publisherChannel = nextChannel;

    console.log("User service notification publisher connected");
  } catch (error) {
    console.error("Failed to connect user notification publisher:", error);
    scheduleReconnect();
  } finally {
    publisherConnecting = false;
  }
};

export const publishNotificationEvent = async (
  message: NotificationEventMessage
) => {
  if (!publisherChannel) {
    await connectNotificationPublisher();
  }

  if (!publisherChannel) {
    return false;
  }

  try {
    await publisherChannel.assertQueue(QUEUE_NAME, { durable: true });
    publisherChannel.sendToQueue(
      QUEUE_NAME,
      Buffer.from(JSON.stringify(message)),
      { persistent: true }
    );
    return true;
  } catch (error) {
    console.error("Failed to publish user notification event:", error);
    publisherChannel = null;
    scheduleReconnect();
    return false;
  }
};
