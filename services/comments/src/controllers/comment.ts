import mongoose from "mongoose";
import { AuthenticatedRequest } from "../middlewares/isAuth.js";
import Comment from "../model/Comment.js";
import TryCatch from "../utils/TryCatch.js";
import { redisClient } from "../utils/redis.js";
import {
  getPendingCommentById,
  getPendingCommentCountByBlogId,
  listPendingCommentsByBlogId,
  removePendingComment,
  updatePendingCommentText,
  upsertPendingComment,
} from "../utils/commentWriteThrough.js";
import {
  invalidateCommentsCacheByBlogId,
  publishCommentCacheInvalidationJob,
  publishCommentWriteJob,
} from "../utils/rabbitmq.js";

const COMMENTS_CACHE_TTL = Number(process.env.COMMENTS_CACHE_TTL || 3600);
const DEFAULT_COMMENTS_PAGE_SIZE = 10;
const MAX_COMMENTS_PAGE_SIZE = 50;

const getCommentsCacheKey = (blogId: number, page: number, limit: number) =>
  `comments:blog:${blogId}:page:${page}:limit:${limit}`;

const parsePositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const normalizeRouteParam = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return "";
};

const getFromCache = async (key: string) => {
  if (!redisClient.isOpen) {
    return null;
  }
  try {
    return await redisClient.get(key);
  } catch (error) {
    console.error("Comments cache get failed:", error);
    return null;
  }
};

const setToCache = async (key: string, value: unknown) => {
  if (!redisClient.isOpen) {
    return;
  }
  try {
    await redisClient.set(key, JSON.stringify(value), {
      EX: COMMENTS_CACHE_TTL,
    });
  } catch (error) {
    console.error("Comments cache set failed:", error);
  }
};

const deleteFromCache = async (key: string) => {
  if (!redisClient.isOpen) {
    return;
  }
  try {
    await redisClient.del(key);
  } catch (error) {
    console.error("Comments cache delete failed:", error);
  }
};

const formatComment = (comment: any) => ({
  id: comment._id.toString(),
  comment: comment.comment,
  user_id: comment.user_id,
  username: comment.username,
  blog_id: comment.blog_id,
  createdAt: comment.createdAt,
  updatedAt: comment.updatedAt,
});

export const addComment = TryCatch(async (req: AuthenticatedRequest, res) => {
  const blogId = Number(req.params.id);
  const text = typeof req.body.comment === "string" ? req.body.comment.trim() : "";
  const userId = req.user?._id;
  const username = req.user?.name;

  if (!Number.isFinite(blogId)) {
    res.status(400).json({
      message: "Invalid blog id",
    });
    return;
  }

  if (!userId || !username) {
    res.status(401).json({
      message: "Unauthorized",
    });
    return;
  }

  if (!text) {
    res.status(400).json({
      message: "Comment is required",
    });
    return;
  }

  const commentId = new mongoose.Types.ObjectId().toString();
  const nowIso = new Date().toISOString();
  const pendingComment = {
    id: commentId,
    comment: text,
    user_id: String(userId),
    username: String(username),
    blog_id: blogId,
    createdAt: nowIso,
    updatedAt: nowIso,
    pending: true as const,
  };

  await upsertPendingComment(pendingComment);

  const queued = await publishCommentWriteJob({
    action: "addComment",
    commentId,
    blogId,
    userId: String(userId),
    username: String(username),
    comment: text,
    createdAt: nowIso,
  });

  if (!queued) {
    await removePendingComment(commentId, blogId);
    res.status(503).json({
      message: "Comment queue unavailable. Please try again.",
    });
    return;
  }

  await Promise.all([
    invalidateCommentsCacheByBlogId(redisClient, blogId),
    publishCommentCacheInvalidationJob(blogId),
  ]);

  res.json({
    message: "Comment queued",
    queued: true,
    comment: pendingComment,
  });
});

export const getAllComments = TryCatch(async (req, res) => {
  const blogId = Number(req.params.id);
  const page = parsePositiveInt(req.query.page, 1);
  const requestedLimit = parsePositiveInt(
    req.query.limit,
    DEFAULT_COMMENTS_PAGE_SIZE
  );
  const limit = Math.min(requestedLimit, MAX_COMMENTS_PAGE_SIZE);

  if (!Number.isFinite(blogId)) {
    res.status(400).json({
      message: "Invalid blog id",
    });
    return;
  }

  const pendingCount = await getPendingCommentCountByBlogId(blogId);
  const shouldUseCache = pendingCount === 0;
  const cacheKey = getCommentsCacheKey(blogId, page, limit);

  if (shouldUseCache) {
    const cached = await getFromCache(cacheKey);

    if (cached) {
      try {
        res.json(JSON.parse(cached));
        return;
      } catch {
        await deleteFromCache(cacheKey);
      }
    }
  }

  const globalOffset = (page - 1) * limit;
  const pendingSlice =
    pendingCount > 0
      ? await listPendingCommentsByBlogId(
          blogId,
          globalOffset,
          globalOffset + limit - 1
        )
      : [];
  const dbSkip = pendingCount > globalOffset ? 0 : globalOffset - pendingCount;
  const dbLimit = Math.max(0, limit - pendingSlice.length);
  const [comments, dbTotal] = await Promise.all([
    dbLimit > 0
      ? Comment.find({ blog_id: blogId })
          .sort({ createdAt: -1 })
          .skip(dbSkip)
          .limit(dbLimit)
      : Promise.resolve([]),
    Comment.countDocuments({ blog_id: blogId }),
  ]);

  const pendingIds = new Set(pendingSlice.map((item) => item.id));
  const dbItems = comments
    .map((comment) => formatComment(comment))
    .filter((comment) => !pendingIds.has(comment.id));

  const items = [...pendingSlice, ...dbItems];
  const total = dbTotal + pendingCount;
  const hasMore = page * limit < total;
  const response = {
    items,
    page,
    limit,
    total,
    hasMore,
  };

  if (shouldUseCache) {
    await setToCache(cacheKey, response);
  }

  res.json(response);
});

export const deleteComment = TryCatch(
  async (req: AuthenticatedRequest, res) => {
    const commentId = normalizeRouteParam(req.params.commentid);
    const userId = req.user?._id;

    if (!mongoose.isValidObjectId(commentId)) {
      res.status(400).json({
        message: "Invalid comment id",
      });
      return;
    }

    if (!userId) {
      res.status(401).json({
        message: "Unauthorized",
      });
      return;
    }

    const pendingComment = await getPendingCommentById(commentId);
    if (pendingComment) {
      if (pendingComment.user_id !== String(userId)) {
        res.status(401).json({
          message: "You are not owner of this comment",
        });
        return;
      }

      const queued = await publishCommentWriteJob({
        action: "deleteComment",
        commentId,
        userId: String(userId),
        deletedAt: new Date().toISOString(),
      });

      if (!queued) {
        res.status(503).json({
          message: "Comment queue unavailable. Please try again.",
        });
        return;
      }

      await Promise.all([
        removePendingComment(commentId, pendingComment.blog_id),
        invalidateCommentsCacheByBlogId(redisClient, pendingComment.blog_id),
        publishCommentCacheInvalidationJob(pendingComment.blog_id),
      ]);

      res.json({
        message: "Comment delete queued",
        queued: true,
      });
      return;
    }

    const comment = await Comment.findById(commentId);

    if (!comment) {
      res.status(404).json({
        message: "No comment with this id",
      });
      return;
    }

    if (String(comment.user_id) !== String(userId)) {
      res.status(401).json({
        message: "You are not owner of this comment",
      });
      return;
    }

    const queued = await publishCommentWriteJob({
      action: "deleteComment",
      commentId: String(comment._id),
      userId: String(userId),
      deletedAt: new Date().toISOString(),
    });

    if (!queued) {
      res.status(503).json({
        message: "Comment queue unavailable. Please try again.",
      });
      return;
    }

    await Promise.all([
      invalidateCommentsCacheByBlogId(redisClient, comment.blog_id),
      publishCommentCacheInvalidationJob(comment.blog_id),
    ]);

    res.json({
      message: "Comment delete queued",
      queued: true,
    });
  }
);

export const updateComment = TryCatch(
  async (req: AuthenticatedRequest, res) => {
    const commentId = normalizeRouteParam(req.params.commentid);
    const userId = req.user?._id;
    const text = typeof req.body.comment === "string" ? req.body.comment.trim() : "";

    if (!mongoose.isValidObjectId(commentId)) {
      res.status(400).json({
        message: "Invalid comment id",
      });
      return;
    }

    if (!userId) {
      res.status(401).json({
        message: "Unauthorized",
      });
      return;
    }

    if (!text) {
      res.status(400).json({
        message: "Comment is required",
      });
      return;
    }

    const pendingComment = await getPendingCommentById(commentId);
    if (pendingComment) {
      if (pendingComment.user_id !== String(userId)) {
        res.status(401).json({
          message: "You are not owner of this comment",
        });
        return;
      }

      const nowIso = new Date().toISOString();
      const previousCommentText = pendingComment.comment;
      const previousUpdatedAt = pendingComment.updatedAt;
      await updatePendingCommentText(commentId, text, nowIso);

      const queued = await publishCommentWriteJob({
        action: "updateComment",
        commentId,
        userId: String(userId),
        comment: text,
        updatedAt: nowIso,
      });

      if (!queued) {
        await updatePendingCommentText(
          commentId,
          previousCommentText,
          previousUpdatedAt
        );
        res.status(503).json({
          message: "Comment queue unavailable. Please try again.",
        });
        return;
      }

      await Promise.all([
        invalidateCommentsCacheByBlogId(redisClient, pendingComment.blog_id),
        publishCommentCacheInvalidationJob(pendingComment.blog_id),
      ]);

      res.json({
        message: "Comment update queued",
        queued: true,
        comment: {
          ...pendingComment,
          comment: text,
          updatedAt: nowIso,
          pending: true,
        },
      });
      return;
    }

    const comment = await Comment.findById(commentId);

    if (!comment) {
      res.status(404).json({
        message: "No comment with this id",
      });
      return;
    }

    if (String(comment.user_id) !== String(userId)) {
      res.status(401).json({
        message: "You are not owner of this comment",
      });
      return;
    }

    const nowIso = new Date().toISOString();
    await upsertPendingComment({
      id: String(comment._id),
      comment: text,
      user_id: String(comment.user_id),
      username: String(comment.username),
      blog_id: Number(comment.blog_id),
      createdAt: new Date(comment.createdAt).toISOString(),
      updatedAt: nowIso,
      pending: true,
    });

    const queued = await publishCommentWriteJob({
      action: "updateComment",
      commentId: String(comment._id),
      userId: String(userId),
      comment: text,
      updatedAt: nowIso,
    });

    if (!queued) {
      await removePendingComment(String(comment._id), Number(comment.blog_id));
      res.status(503).json({
        message: "Comment queue unavailable. Please try again.",
      });
      return;
    }

    await Promise.all([
      invalidateCommentsCacheByBlogId(redisClient, comment.blog_id),
      publishCommentCacheInvalidationJob(comment.blog_id),
    ]);

    res.json({
      message: "Comment update queued",
      queued: true,
      comment: {
        ...formatComment(comment),
        comment: text,
        pending: true,
      },
    });
  }
);
