export interface ProfileStarFlushJobMessage {
  userId: string;
  reason: "profile_star";
  emittedAt: string;
}

export const PROFILE_STAR_FLUSH_QUEUE_NAME =
  process.env.PROFILE_STAR_FLUSH_QUEUE || "user-profile-star-flush";

const RECONNECT_DELAY_MS = Number(process.env.RABBITMQ_RECONNECT_DELAY_MS || 5000);

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
          "Profile star publisher disabled because amqplib is not installed in services/user.",
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
    void connectProfileStarFlushPublisher();
  }, RECONNECT_DELAY_MS);

  if (typeof reconnectTimer.unref === "function") {
    reconnectTimer.unref();
  }
};

export const connectProfileStarFlushPublisher = async () => {
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
      console.error("Profile star publisher connection error:", error);
    });

    nextConnection.on("close", () => {
      console.error("Profile star publisher connection closed. Scheduling reconnect...");
      publisherConnection = null;
      publisherChannel = null;
      scheduleReconnect();
    });

    const nextChannel = await nextConnection.createChannel();
    nextChannel.on("error", (error: unknown) => {
      console.error("Profile star publisher channel error:", error);
    });
    nextChannel.on("close", () => {
      console.error("Profile star publisher channel closed. Scheduling reconnect...");
      publisherChannel = null;
      scheduleReconnect();
    });

    await nextChannel.assertQueue(PROFILE_STAR_FLUSH_QUEUE_NAME, {
      durable: true,
    });

    publisherConnection = nextConnection;
    publisherChannel = nextChannel;

    console.log("User service profile-star publisher connected");
  } catch (error) {
    console.error("Failed to connect profile-star publisher:", error);
    scheduleReconnect();
  } finally {
    publisherConnecting = false;
  }
};

export const publishProfileStarFlushJob = async (
  message: ProfileStarFlushJobMessage
) => {
  if (!publisherChannel) {
    await connectProfileStarFlushPublisher();
  }

  if (!publisherChannel) {
    return false;
  }

  try {
    await publisherChannel.assertQueue(PROFILE_STAR_FLUSH_QUEUE_NAME, {
      durable: true,
    });
    publisherChannel.sendToQueue(
      PROFILE_STAR_FLUSH_QUEUE_NAME,
      Buffer.from(JSON.stringify(message)),
      { persistent: true }
    );
    return true;
  } catch (error) {
    console.error("Failed to publish profile-star flush job:", error);
    publisherChannel = null;
    scheduleReconnect();
    return false;
  }
};

