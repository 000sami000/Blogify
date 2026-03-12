import { redisClient } from "./redis.js";

export interface PendingCommentSnapshot {
  id: string;
  comment: string;
  user_id: string;
  username: string;
  blog_id: number;
  createdAt: string;
  updatedAt: string;
  pending: true;
}

const PENDING_COMMENT_TTL_SECONDS = Number(
  process.env.COMMENT_PENDING_TTL_SECONDS || 1800
);

const getPendingItemKey = (commentId: string) => `comments:pending:item:${commentId}`;
const getPendingBlogKey = (blogId: number) => `comments:pending:blog:${blogId}`;

const parsePendingSnapshot = (
  raw: string | null
): PendingCommentSnapshot | null => {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PendingCommentSnapshot>;

    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      typeof parsed.comment !== "string" ||
      typeof parsed.user_id !== "string" ||
      typeof parsed.username !== "string" ||
      !Number.isFinite(Number(parsed.blog_id)) ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }

    return {
      id: parsed.id,
      comment: parsed.comment,
      user_id: parsed.user_id,
      username: parsed.username,
      blog_id: Number(parsed.blog_id),
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
      pending: true,
    };
  } catch {
    return null;
  }
};

export const getPendingCommentById = async (commentId: string) => {
  if (!redisClient.isOpen) {
    return null;
  }

  try {
    const raw = await redisClient.get(getPendingItemKey(commentId));
    return parsePendingSnapshot(raw);
  } catch (error) {
    console.error("Failed to get pending comment from redis:", error);
    return null;
  }
};

export const upsertPendingComment = async (snapshot: PendingCommentSnapshot) => {
  if (!redisClient.isOpen) {
    return;
  }

  const itemKey = getPendingItemKey(snapshot.id);
  const blogKey = getPendingBlogKey(snapshot.blog_id);
  const score = Date.parse(snapshot.createdAt) || Date.now();

  try {
    const multi = redisClient.multi();
    multi.set(itemKey, JSON.stringify(snapshot), {
      EX: PENDING_COMMENT_TTL_SECONDS,
    });
    multi.zAdd(blogKey, [{ score, value: snapshot.id }]);
    multi.expire(blogKey, PENDING_COMMENT_TTL_SECONDS);
    await multi.exec();
  } catch (error) {
    console.error("Failed to upsert pending comment in redis:", error);
  }
};

export const updatePendingCommentText = async (
  commentId: string,
  comment: string,
  updatedAt: string
) => {
  if (!redisClient.isOpen) {
    return null;
  }

  try {
    const current = await getPendingCommentById(commentId);
    if (!current) {
      return null;
    }

    const next: PendingCommentSnapshot = {
      ...current,
      comment,
      updatedAt,
      pending: true,
    };

    await upsertPendingComment(next);
    return next;
  } catch (error) {
    console.error("Failed to update pending comment in redis:", error);
    return null;
  }
};

export const removePendingComment = async (
  commentId: string,
  blogId?: number
) => {
  if (!redisClient.isOpen) {
    return;
  }

  try {
    const current =
      typeof blogId === "number" && Number.isFinite(blogId)
        ? null
        : await getPendingCommentById(commentId);
    const resolvedBlogId =
      typeof blogId === "number" && Number.isFinite(blogId)
        ? blogId
        : current?.blog_id;

    const multi = redisClient.multi();
    multi.del(getPendingItemKey(commentId));
    if (typeof resolvedBlogId === "number" && Number.isFinite(resolvedBlogId)) {
      multi.zRem(getPendingBlogKey(resolvedBlogId), commentId);
    }
    await multi.exec();
  } catch (error) {
    console.error("Failed to remove pending comment from redis:", error);
  }
};

export const getPendingCommentCountByBlogId = async (blogId: number) => {
  if (!redisClient.isOpen) {
    return 0;
  }

  try {
    return await redisClient.zCard(getPendingBlogKey(blogId));
  } catch (error) {
    console.error("Failed to count pending comments in redis:", error);
    return 0;
  }
};

export const listPendingCommentsByBlogId = async (
  blogId: number,
  start: number,
  stop: number
) => {
  if (!redisClient.isOpen) {
    return [] as PendingCommentSnapshot[];
  }

  try {
    const ids = await redisClient.zRange(getPendingBlogKey(blogId), start, stop, {
      REV: true,
    });

    if (ids.length === 0) {
      return [] as PendingCommentSnapshot[];
    }

    const snapshots = await Promise.all(ids.map((id) => getPendingCommentById(id)));
    const valid = snapshots.filter(
      (item): item is PendingCommentSnapshot => item !== null
    );

    // Remove stale references that no longer have snapshot payload.
    const staleIds = ids.filter(
      (id) => !valid.some((snapshot) => snapshot.id === id)
    );
    if (staleIds.length > 0) {
      await redisClient.zRem(getPendingBlogKey(blogId), staleIds);
    }

    return valid;
  } catch (error) {
    console.error("Failed to list pending comments in redis:", error);
    return [] as PendingCommentSnapshot[];
  }
};
