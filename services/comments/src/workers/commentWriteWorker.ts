import dotenv from "dotenv";
import mongoose from "mongoose";
import Comment from "../model/Comment.js";
import { connectDb } from "../utils/db.js";
import { removePendingComment } from "../utils/commentWriteThrough.js";
import { connectRedis, redisClient } from "../utils/redis.js";
import {
  CommentWriteJob,
  connectRabbitMQ,
  invalidateCommentsCacheByBlogId,
  publishCommentCacheInvalidationJob,
  publishNotificationEvent,
  startCommentWriteConsumer,
} from "../utils/rabbitmq.js";

dotenv.config();

const BLOG_SERVICE = process.env.BLOG_SERVICE || "http://localhost:9001";

interface BlogMetaResponse {
  id: number;
  author: string;
  title?: string;
}

const getBlogMeta = async (blogId: number) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${BLOG_SERVICE}/api/v1/blog/${blogId}/meta`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as Partial<BlogMetaResponse>;

    if (!data || !data.author) {
      return null;
    }

    return {
      id: Number(data.id ?? blogId),
      author: String(data.author),
      title: typeof data.title === "string" ? data.title : "",
    };
  } catch (error) {
    console.error(`Failed to fetch blog meta for blog ${blogId}:`, error);
    return null;
  }
};

const processCommentWriteJob = async (job: CommentWriteJob) => {
  if (job.action === "addComment") {
    const commentId = new mongoose.Types.ObjectId(job.commentId);

    await Comment.updateOne(
      { _id: commentId },
      {
        $setOnInsert: {
          _id: commentId,
          comment: job.comment,
          user_id: job.userId,
          username: job.username,
          blog_id: Number(job.blogId),
          createdAt: new Date(job.createdAt),
        },
        $set: {
          updatedAt: new Date(job.createdAt),
        },
      },
      { upsert: true }
    );

    await Promise.all([
      invalidateCommentsCacheByBlogId(redisClient, Number(job.blogId)),
      publishCommentCacheInvalidationJob(Number(job.blogId)),
    ]);

    const meta = await getBlogMeta(Number(job.blogId));
    if (meta && meta.author !== String(job.userId)) {
      await publishNotificationEvent({
        type: "blog_comment",
        recipientUserId: meta.author,
        actorUserId: String(job.userId),
        actorName: job.username,
        blogId: Number(job.blogId),
        commentId: String(job.commentId),
        createdAt: new Date().toISOString(),
        message: `${job.username} commented on your blog`,
      });
    }

    await removePendingComment(String(job.commentId), Number(job.blogId));
    return;
  }

  if (job.action === "updateComment") {
    const comment = await Comment.findOne({
      _id: job.commentId,
      user_id: job.userId,
    });

    if (!comment) {
      return;
    }

    comment.comment = job.comment;
    comment.updatedAt = new Date(job.updatedAt);
    await comment.save();

    await Promise.all([
      invalidateCommentsCacheByBlogId(redisClient, comment.blog_id),
      publishCommentCacheInvalidationJob(comment.blog_id),
    ]);

    await removePendingComment(String(job.commentId), comment.blog_id);
    return;
  }

  if (job.action === "deleteComment") {
    const comment = await Comment.findOne({
      _id: job.commentId,
      user_id: job.userId,
    });

    if (!comment) {
      return;
    }

    const blogId = comment.blog_id;
    await comment.deleteOne();

    await Promise.all([
      invalidateCommentsCacheByBlogId(redisClient, blogId),
      publishCommentCacheInvalidationJob(blogId),
    ]);

    await removePendingComment(String(job.commentId), blogId);
  }
};

const startWorker = async () => {
  await connectDb();
  console.log("Comment write worker connected to MongoDB");

  await connectRedis();
  console.log("Comment write worker connected to Redis");

  await connectRabbitMQ();
  await startCommentWriteConsumer(processCommentWriteJob);

  console.log("Comment write worker started");
};

startWorker().catch((error) => {
  console.error("Failed to start comment write worker:", error);
  process.exit(1);
});
