import amqp from "amqplib";
import Comment from "../model/Comment.js";

interface BlogEventMessage {
  action: string;
  blogId?: number;
}

interface CommentCacheInvalidationMessage {
  action: string;
  blogId?: number;
}

export type CommentWriteJob =
  | {
      action: "addComment";
      commentId: string;
      blogId: number;
      userId: string;
      username: string;
      comment: string;
      createdAt: string;
    }
  | {
      action: "updateComment";
      commentId: string;
      userId: string;
      comment: string;
      updatedAt: string;
    }
  | {
      action: "deleteComment";
      commentId: string;
      userId: string;
      deletedAt: string;
    };

interface NotificationEventMessage {
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

interface CommentsRedisClient {
  del: (key: string | string[]) => Promise<unknown>;
  isOpen?: boolean;
  keys?: (pattern: string) => Promise<string[]>;
  scanIterator?: (options: {
    MATCH?: string;
    COUNT?: number;
  }) => AsyncIterable<string | string[]>;
}

const RECONNECT_DELAY_MS = Number(
  process.env.RABBITMQ_RECONNECT_DELAY_MS || 5000
);
const RABBITMQ_PREFETCH = Number(process.env.RABBITMQ_PREFETCH || 20);
const COMMENT_WRITE_PREFETCH = Number(process.env.COMMENT_WRITE_PREFETCH || 1);

let connection: amqp.ChannelModel | null = null;
let channel: amqp.Channel | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connecting = false;

let channelGeneration = 0;
let blogConsumerGeneration = 0;
let cacheConsumerGeneration = 0;
let commentWriteConsumerGeneration = 0;

let shouldConsumeBlogEvents = false;
let shouldConsumeCacheInvalidation = false;
let shouldConsumeCommentWriteJobs = false;
let cacheInvalidationRedisClient: CommentsRedisClient | null = null;
let commentWriteJobHandler: ((job: CommentWriteJob) => Promise<void>) | null =
  null;

const BLOG_EVENTS_QUEUE = "blog-events";
const COMMENT_CACHE_INVALIDATION_QUEUE = "comment-cache-invalidation";
const COMMENT_WRITE_JOBS_QUEUE =
  process.env.COMMENT_WRITE_JOBS_QUEUE || "comments-write-jobs";
const NOTIFICATION_EVENTS_QUEUE =
  process.env.NOTIFICATION_EVENTS_QUEUE || "notification-events";

const getCommentsCachePrefix = (blogId: number) => `comments:blog:${blogId}:`;

const buildConnectionOptions = () => ({
  protocol: "amqp" as const,
  hostname: process.env.Rabbimq_Host || "localhost",
  port: Number(process.env.Rabbitmq_Port || 5672),
  username: process.env.Rabbimq_Username || "guest",
  password: process.env.Rabbimq_Password || "guest",
  heartbeat: Number(process.env.RABBITMQ_HEARTBEAT_SECONDS || 30),
});

const findKeysByPattern = async (
  redisClient: CommentsRedisClient,
  cachePattern: string
) => {
  if (redisClient.scanIterator) {
    const keys: string[] = [];
    for await (const key of redisClient.scanIterator({
      MATCH: cachePattern,
      COUNT: 100,
    })) {
      if (Array.isArray(key)) {
        keys.push(...key);
      } else {
        keys.push(key);
      }
    }
    return keys;
  }

  if (redisClient.keys) {
    return redisClient.keys(cachePattern);
  }

  return [];
};

const scheduleReconnect = () => {
  if (reconnectTimer || connecting) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectRabbitMQ();
  }, RECONNECT_DELAY_MS);

  if (typeof reconnectTimer.unref === "function") {
    reconnectTimer.unref();
  }
};

const safeAck = (consumerChannel: amqp.Channel, msg: amqp.ConsumeMessage) => {
  try {
    consumerChannel.ack(msg);
  } catch (error) {
    console.error("Rabbitmq ack failed:", error);
  }
};

const safeNack = (
  consumerChannel: amqp.Channel,
  msg: amqp.ConsumeMessage,
  requeue = true
) => {
  try {
    consumerChannel.nack(msg, false, requeue);
  } catch (error) {
    console.error("Rabbitmq nack failed:", error);
  }
};

const ensureBlogEventsConsumer = async () => {
  if (!channel || !shouldConsumeBlogEvents) {
    return;
  }

  if (blogConsumerGeneration === channelGeneration) {
    return;
  }

  const consumerChannel = channel;
  console.log("Comments service blog-events consumer started");

  await consumerChannel.consume(BLOG_EVENTS_QUEUE, async (msg) => {
    if (!msg) {
      return;
    }

    try {
      const content = JSON.parse(msg.content.toString()) as BlogEventMessage;

      if (content.action === "blogDeleted" && Number.isFinite(content.blogId)) {
        const blogId = Number(content.blogId);
        await Comment.deleteMany({ blog_id: blogId });
        await publishCommentCacheInvalidationJob(blogId);
        console.log(`Deleted comments for blog ${blogId}`);
      }

      safeAck(consumerChannel, msg);
    } catch (error) {
      console.error("Failed to process blog event in comments service:", error);
      safeNack(consumerChannel, msg, true);
    }
  });

  blogConsumerGeneration = channelGeneration;
};

const ensureCommentCacheInvalidationConsumer = async () => {
  if (
    !channel ||
    !shouldConsumeCacheInvalidation ||
    !cacheInvalidationRedisClient
  ) {
    return;
  }

  if (cacheConsumerGeneration === channelGeneration) {
    return;
  }

  const consumerChannel = channel;
  const redisClient = cacheInvalidationRedisClient;
  console.log("Comments service cache invalidation consumer started");

  await consumerChannel.consume(COMMENT_CACHE_INVALIDATION_QUEUE, async (msg) => {
    if (!msg) {
      return;
    }

    try {
      const content = JSON.parse(
        msg.content.toString()
      ) as CommentCacheInvalidationMessage;

      if (
        content.action === "invalidateCommentsCache" &&
        Number.isFinite(content.blogId)
      ) {
        const blogId = Number(content.blogId);
        const cachePattern = `${getCommentsCachePrefix(blogId)}*`;
        if (redisClient.isOpen === false) {
          console.warn(
            `Skipped comments cache invalidation for blog ${blogId} because redis is disconnected`
          );
        } else {
          const keys = await findKeysByPattern(redisClient, cachePattern);
          if (keys.length > 0) await redisClient.del(keys);

          console.log(
            `Invalidated comments cache for blog ${blogId}. Removed keys: ${keys.length}`
          );
        }
      }

      safeAck(consumerChannel, msg);
    } catch (error) {
      console.error("Failed to invalidate comments cache:", error);
      safeNack(consumerChannel, msg, true);
    }
  });

  cacheConsumerGeneration = channelGeneration;
};

const ensureCommentWriteConsumer = async () => {
  if (!channel || !shouldConsumeCommentWriteJobs || !commentWriteJobHandler) {
    return;
  }

  if (commentWriteConsumerGeneration === channelGeneration) {
    return;
  }

  const consumerChannel = channel;
  const handler = commentWriteJobHandler;

  await consumerChannel.prefetch(COMMENT_WRITE_PREFETCH);
  console.log("Comments service comment-write consumer started");

  await consumerChannel.consume(COMMENT_WRITE_JOBS_QUEUE, async (msg) => {
    if (!msg) {
      return;
    }

    try {
      const content = JSON.parse(msg.content.toString()) as CommentWriteJob;
      await handler(content);
      safeAck(consumerChannel, msg);
    } catch (error) {
      console.error("Failed to process comment write job:", error);
      safeNack(consumerChannel, msg, true);
    }
  });

  commentWriteConsumerGeneration = channelGeneration;
};

const ensureConsumers = async () => {
  await ensureBlogEventsConsumer();
  await ensureCommentCacheInvalidationConsumer();
  await ensureCommentWriteConsumer();
};

export const connectRabbitMQ = async () => {
  if (channel || connecting) {
    return;
  }

  connecting = true;
  try {
    const nextConnection = await amqp.connect(buildConnectionOptions());

    nextConnection.on("error", (error) => {
      console.error("Rabbitmq connection error:", error);
    });

    nextConnection.on("close", () => {
      console.error("Rabbitmq connection closed. Scheduling reconnect...");
      connection = null;
      channel = null;
      scheduleReconnect();
    });

    const nextChannel = await nextConnection.createChannel();

    nextChannel.on("error", (error) => {
      console.error("Rabbitmq channel error:", error);
    });

    nextChannel.on("close", () => {
      console.error("Rabbitmq channel closed. Scheduling reconnect...");
      channel = null;
      scheduleReconnect();
    });

    nextChannel.prefetch(RABBITMQ_PREFETCH);
    await nextChannel.assertQueue(BLOG_EVENTS_QUEUE, { durable: true });
    await nextChannel.assertQueue(COMMENT_CACHE_INVALIDATION_QUEUE, {
      durable: true,
    });
    await nextChannel.assertQueue(COMMENT_WRITE_JOBS_QUEUE, { durable: true });
    await nextChannel.assertQueue(NOTIFICATION_EVENTS_QUEUE, { durable: true });

    connection = nextConnection;
    channel = nextChannel;
    channelGeneration += 1;

    console.log("Connected to Rabbitmq");
    await ensureConsumers();
  } catch (error) {
    console.error("Failed to connect Rabbitmq. Will retry:", error);
    scheduleReconnect();
  } finally {
    connecting = false;
  }
};

export const publishToQueue = async (queueName: string, message: unknown) => {
  if (!channel) {
    await connectRabbitMQ();
  }

  if (!channel) {
    console.error("Rabbitmq channel is not initialized");
    return false;
  }

  try {
    channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), {
      persistent: true,
    });
    return true;
  } catch (error) {
    console.error(`Failed to publish message to ${queueName}:`, error);
    scheduleReconnect();
    return false;
  }
};

export const publishCommentCacheInvalidationJob = async (blogId: number) => {
  return publishToQueue(COMMENT_CACHE_INVALIDATION_QUEUE, {
    action: "invalidateCommentsCache",
    blogId,
  });
};

export const publishCommentWriteJob = async (job: CommentWriteJob) => {
  return publishToQueue(COMMENT_WRITE_JOBS_QUEUE, job);
};

export const publishNotificationEvent = async (
  event: NotificationEventMessage
) => {
  return publishToQueue(NOTIFICATION_EVENTS_QUEUE, event);
};

export const invalidateCommentsCacheByBlogId = async (
  redisClient: CommentsRedisClient,
  blogId: number
) => {
  if (redisClient.isOpen === false) {
    return;
  }

  try {
    const cachePattern = `${getCommentsCachePrefix(blogId)}*`;
    const keys = await findKeysByPattern(redisClient, cachePattern);

    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (error) {
    console.error(
      `Failed to invalidate local comments cache for blog ${blogId}:`,
      error
    );
  }
};

export const startBlogEventsConsumer = async () => {
  shouldConsumeBlogEvents = true;
  await connectRabbitMQ();
  await ensureBlogEventsConsumer();
};

export const startCommentCacheInvalidationConsumer = async (
  redisClient: CommentsRedisClient
) => {
  cacheInvalidationRedisClient = redisClient;
  shouldConsumeCacheInvalidation = true;
  await connectRabbitMQ();
  await ensureCommentCacheInvalidationConsumer();
};

export const startCommentWriteConsumer = async (
  handler: (job: CommentWriteJob) => Promise<void>
) => {
  commentWriteJobHandler = handler;
  shouldConsumeCommentWriteJobs = true;
  await connectRabbitMQ();
  await ensureCommentWriteConsumer();
};
