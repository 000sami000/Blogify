import { Blog } from "../entities/Blog.js";
import { BlogLike } from "../entities/BlogLike.js";
import { publishCounterFlushJob } from "./counterQueue.js";
import { redisClient } from "./redis.js";
import { AppDataSource } from "./db.js";

// Strict view window: a viewer can increment the same blog only once every 30 minutes.
const VIEW_THROTTLE_TTL_SECONDS = 30 * 60;
const FLUSH_INTERVAL_MS = 10_000;

const DIRTY_BLOGS_SET_KEY = "blogs:counters:dirty";
const DIRTY_DAILY_VIEWS_SET_KEY = "blogs:views:daily:dirty";
const FLUSH_NOTIFY_KEY = (blogId: number) => `blog:${blogId}:flush:notify`;
const FLUSH_LOCK_KEY = "blogs:counters:flush:lock";

const getCounterKey = (blogId: number) => `blog:${blogId}:counter`;
const getDailyViewsKey = (blogId: number, day: string) =>
  `blog:${blogId}:views:daily:${day}`;
const getLikesAddKey = (blogId: number) => `blog:${blogId}:likes:add`;
const getLikesRemoveKey = (blogId: number) => `blog:${blogId}:likes:remove`;
const getViewThrottleKey = (blogId: number, viewerIdentity: string) =>
  `post:${blogId}:viewed:${encodeURIComponent(viewerIdentity)}`;
const localViewThrottle = new Map<string, number>();

const cleanupDrainedBlogKeys = async (blogId: number) => {
  if (!redisClient.isOpen) {
    return false;
  }

  const counterKey = getCounterKey(blogId);
  const likesAddKey = getLikesAddKey(blogId);
  const likesRemoveKey = getLikesRemoveKey(blogId);

  const result = await redisClient.eval(
    `
      local counterKey = KEYS[1]
      local likesAddKey = KEYS[2]
      local likesRemoveKey = KEYS[3]
      local dirtySetKey = KEYS[4]
      local blogId = ARGV[1]

      local views = tonumber(redis.call('HGET', counterKey, 'viewsDelta') or '0')
      local likes = tonumber(redis.call('HGET', counterKey, 'likesDelta') or '0')
      local pendingAdds = tonumber(redis.call('SCARD', likesAddKey) or '0')
      local pendingRemoves = tonumber(redis.call('SCARD', likesRemoveKey) or '0')

      if views == 0 and likes == 0 and pendingAdds == 0 and pendingRemoves == 0 then
        redis.call('DEL', counterKey)
        redis.call('DEL', likesAddKey)
        redis.call('DEL', likesRemoveKey)
        redis.call('SREM', dirtySetKey, blogId)
        return 1
      end

      return 0
    `,
    {
      keys: [counterKey, likesAddKey, likesRemoveKey, DIRTY_BLOGS_SET_KEY],
      arguments: [String(blogId)],
    }
  );

  return toInt(result) === 1;
};

const toInt = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.trunc(parsed);
};

const toDayString = (date: Date) => date.toISOString().slice(0, 10);

const parseDailyViewToken = (token: string) => {
  const [blogRaw, day] = token.split("|");
  const blogId = Number(blogRaw);
  if (!Number.isFinite(blogId) || blogId <= 0 || !day) {
    return null;
  }
  return { blogId: Math.trunc(blogId), day };
};

const reserveLocalViewWindow = (throttleKey: string, ttlSeconds: number) => {
  const now = Date.now();
  const currentExpiry = localViewThrottle.get(throttleKey);

  if (typeof currentExpiry === "number" && currentExpiry > now) {
    return false;
  }

  localViewThrottle.set(throttleKey, now + ttlSeconds * 1000);

  if (localViewThrottle.size > 50_000) {
    for (const [key, expiry] of localViewThrottle.entries()) {
      if (expiry <= now) {
        localViewThrottle.delete(key);
      }
    }
  }

  return true;
};

const persistViewFallbackToDb = async (blogId: number) => {
  const day = toDayString(new Date());
  await AppDataSource.transaction(async (manager) => {
    await manager.query(
      `
        UPDATE blogs
        SET views_count = views_count + 1
        WHERE id = $1
      `,
      [blogId]
    );

    await manager.query(
      `
        INSERT INTO blog_view_stats (blog_id, day, views_count)
        VALUES ($1, $2::date, 1)
        ON CONFLICT (blog_id, day)
        DO UPDATE SET views_count = blog_view_stats.views_count + EXCLUDED.views_count
      `,
      [blogId, day]
    );
  });
};

const markBlogAsDirty = async (blogId: number) => {
  if (!redisClient.isOpen) {
    return;
  }
  await redisClient.sAdd(DIRTY_BLOGS_SET_KEY, String(blogId));
};

const queueFlushJobIfNeeded = async (
  blogId: number,
  reason: "view" | "like"
) => {
  if (!redisClient.isOpen) {
    return;
  }

  const shouldNotify = await redisClient.set(FLUSH_NOTIFY_KEY(blogId), "1", {
    NX: true,
    EX: 2,
  });

  if (shouldNotify !== "OK") {
    return;
  }

  void publishCounterFlushJob({
    blogId,
    reason,
    emittedAt: new Date().toISOString(),
  });
};

export const registerUniqueView = async (
  blogId: number,
  viewerIdentity: string
) => {
  if (!viewerIdentity) {
    return false;
  }

  const throttleKey = getViewThrottleKey(blogId, viewerIdentity);

  if (!redisClient.isOpen) {
    const allowed = reserveLocalViewWindow(
      throttleKey,
      VIEW_THROTTLE_TTL_SECONDS
    );
    if (!allowed) {
      return false;
    }

    try {
      await persistViewFallbackToDb(blogId);
      return true;
    } catch (error) {
      console.error("Failed to persist fallback blog view:", error);
      return false;
    }
  }

  const didSet = await redisClient.set(throttleKey, "1", {
    NX: true,
    EX: VIEW_THROTTLE_TTL_SECONDS,
  });

  if (!didSet) {
    return false;
  }

  const day = toDayString(new Date());
  const multi = redisClient.multi();
  multi.hIncrBy(getCounterKey(blogId), "viewsDelta", 1);
  multi.incrBy(getDailyViewsKey(blogId, day), 1);
  multi.sAdd(DIRTY_DAILY_VIEWS_SET_KEY, `${blogId}|${day}`);
  multi.sAdd(DIRTY_BLOGS_SET_KEY, String(blogId));
  await multi.exec();
  await queueFlushJobIfNeeded(blogId, "view");
  return true;
};

export const getCounterDelta = async (blogId: number) => {
  if (!redisClient.isOpen) {
    return { viewsDelta: 0, likesDelta: 0 };
  }

  const raw = await redisClient.hGetAll(getCounterKey(blogId));
  return {
    viewsDelta: toInt(raw.viewsDelta),
    likesDelta: toInt(raw.likesDelta),
  };
};

export const applyRealtimeCountersToBlog = async (blog: Blog) => {
  const delta = await getCounterDelta(blog.id);
  blog.viewsCount = Math.max(0, toInt(blog.viewsCount) + delta.viewsDelta);
  blog.likesCount = Math.max(0, toInt(blog.likesCount) + delta.likesDelta);
  return blog;
};

export const applyRealtimeCountersToBlogs = async (blogs: Blog[]) => {
  if (blogs.length === 0) {
    return blogs;
  }

  for (const blog of blogs) {
    await applyRealtimeCountersToBlog(blog);
  }

  return blogs;
};

const isLikedInDb = async (blogId: number, userId: string) => {
  const blogLikeRepo = AppDataSource.getRepository(BlogLike);
  return blogLikeRepo.existsBy({ blogId, userId });
};

const resolveCurrentLikeState = async (blogId: number, userId: string) => {
  if (!redisClient.isOpen) {
    return isLikedInDb(blogId, userId);
  }

  const [pendingAdd, pendingRemove] = await Promise.all([
    redisClient.sIsMember(getLikesAddKey(blogId), userId),
    redisClient.sIsMember(getLikesRemoveKey(blogId), userId),
  ]);

  if (pendingAdd) {
    return true;
  }

  if (pendingRemove) {
    return false;
  }

  return isLikedInDb(blogId, userId);
};

export const toggleLike = async (blogId: number, userId: string) => {
  if (!redisClient.isOpen) {
    throw new Error("Redis is not connected. Like service is temporarily unavailable.");
  }

  const likesAddKey = getLikesAddKey(blogId);
  const likesRemoveKey = getLikesRemoveKey(blogId);
  const counterKey = getCounterKey(blogId);

  const alreadyLiked = await resolveCurrentLikeState(blogId, userId);
  const multi = redisClient.multi();

  if (alreadyLiked) {
    multi.sAdd(likesRemoveKey, userId);
    multi.sRem(likesAddKey, userId);
    multi.hIncrBy(counterKey, "likesDelta", -1);
  } else {
    multi.sAdd(likesAddKey, userId);
    multi.sRem(likesRemoveKey, userId);
    multi.hIncrBy(counterKey, "likesDelta", 1);
  }

  multi.sAdd(DIRTY_BLOGS_SET_KEY, String(blogId));
  await multi.exec();
  await queueFlushJobIfNeeded(blogId, "like");

  return {
    liked: !alreadyLiked,
  };
};

export const isLikedByUser = async (blogId: number, userId: string) => {
  return resolveCurrentLikeState(blogId, userId);
};

const isBlogPresent = async (blogId: number) => {
  const blogRepo = AppDataSource.getRepository(Blog);
  return blogRepo.existsBy({ id: blogId });
};

const flushSingleBlogCounters = async (blogId: number) => {
  const blogExists = await isBlogPresent(blogId);

  if (!blogExists) {
    await redisClient.del([
      getCounterKey(blogId),
      getLikesAddKey(blogId),
      getLikesRemoveKey(blogId),
    ]);
    await redisClient.sRem(DIRTY_BLOGS_SET_KEY, String(blogId));
    return;
  }

  const counterKey = getCounterKey(blogId);
  const likesAddKey = getLikesAddKey(blogId);
  const likesRemoveKey = getLikesRemoveKey(blogId);

  const [viewsRaw, likesRaw, likesToAdd, likesToRemove] = await Promise.all([
    redisClient.hGet(counterKey, "viewsDelta"),
    redisClient.hGet(counterKey, "likesDelta"),
    redisClient.sMembers(likesAddKey),
    redisClient.sMembers(likesRemoveKey),
  ]);

  const viewsDelta = toInt(viewsRaw);
  const likesDelta = toInt(likesRaw);

  if (viewsDelta !== 0) {
    await redisClient.hIncrBy(counterKey, "viewsDelta", -viewsDelta);
  }

  if (likesDelta !== 0) {
    await redisClient.hIncrBy(counterKey, "likesDelta", -likesDelta);
  }

  if (viewsDelta === 0 && likesDelta === 0 && likesToAdd.length === 0 && likesToRemove.length === 0) {
    await cleanupDrainedBlogKeys(blogId);
    return;
  }

  try {
    await AppDataSource.transaction(async (manager) => {
      if (viewsDelta !== 0 || likesDelta !== 0) {
        await manager.query(
          `
            UPDATE blogs
            SET
              views_count = GREATEST(views_count + $1, 0),
              likes_count = GREATEST(likes_count + $2, 0)
            WHERE id = $3
          `,
          [viewsDelta, likesDelta, blogId]
        );
      }

      if (likesToAdd.length > 0) {
        await manager.query(
          `
            INSERT INTO blog_likes (blog_id, user_id)
            SELECT $1, UNNEST($2::text[])
            ON CONFLICT (blog_id, user_id) DO NOTHING
          `,
          [blogId, likesToAdd]
        );
      }

      if (likesToRemove.length > 0) {
        await manager.query(
          `
            DELETE FROM blog_likes
            WHERE blog_id = $1
              AND user_id = ANY($2::text[])
          `,
          [blogId, likesToRemove]
        );
      }
    });

    if (likesToAdd.length > 0) {
      await redisClient.sRem(likesAddKey, likesToAdd);
    }

    if (likesToRemove.length > 0) {
      await redisClient.sRem(likesRemoveKey, likesToRemove);
    }
  } catch (error) {
    if (viewsDelta !== 0) {
      await redisClient.hIncrBy(counterKey, "viewsDelta", viewsDelta);
    }

    if (likesDelta !== 0) {
      await redisClient.hIncrBy(counterKey, "likesDelta", likesDelta);
    }

    await markBlogAsDirty(blogId);
    throw error;
  }

  await cleanupDrainedBlogKeys(blogId);
};

const flushSingleDailyView = async (token: string) => {
  const parsed = parseDailyViewToken(token);
  if (!parsed) {
    await redisClient.sRem(DIRTY_DAILY_VIEWS_SET_KEY, token);
    return;
  }

  const { blogId, day } = parsed;
  const blogExists = await isBlogPresent(blogId);
  const redisKey = getDailyViewsKey(blogId, day);

  if (!blogExists) {
    await redisClient.del(redisKey);
    await redisClient.sRem(DIRTY_DAILY_VIEWS_SET_KEY, token);
    return;
  }

  const raw = await redisClient.get(redisKey);
  const delta = toInt(raw);

  if (delta <= 0) {
    await redisClient.del(redisKey);
    await redisClient.sRem(DIRTY_DAILY_VIEWS_SET_KEY, token);
    return;
  }

  await redisClient.decrBy(redisKey, delta);

  try {
    await AppDataSource.query(
      `
        INSERT INTO blog_view_stats (blog_id, day, views_count)
        VALUES ($1, $2::date, $3)
        ON CONFLICT (blog_id, day)
        DO UPDATE SET views_count = blog_view_stats.views_count + EXCLUDED.views_count
      `,
      [blogId, day, delta]
    );
  } catch (error) {
    await redisClient.incrBy(redisKey, delta);
    throw error;
  }

  const remainingRaw = await redisClient.get(redisKey);
  const remaining = toInt(remainingRaw);
  if (remaining <= 0) {
    await redisClient.del(redisKey);
    await redisClient.sRem(DIRTY_DAILY_VIEWS_SET_KEY, token);
  } else {
    await redisClient.sAdd(DIRTY_DAILY_VIEWS_SET_KEY, token);
  }
};

let workerStarted = false;
let flushInProgress = false;

export const flushDirtyCountersNow = async () => {
  if (flushInProgress || !redisClient.isOpen) {
    return;
  }

  const lockToken = `${process.pid}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const lockAcquired = await redisClient.set(FLUSH_LOCK_KEY, lockToken, {
    NX: true,
    EX: 15,
  });

  if (lockAcquired !== "OK") {
    return;
  }

  flushInProgress = true;
  try {
    const dirtyBlogIds = await redisClient.sMembers(DIRTY_BLOGS_SET_KEY);

    for (const rawId of dirtyBlogIds) {
      const blogId = toInt(rawId);

      if (blogId <= 0) {
        await redisClient.sRem(DIRTY_BLOGS_SET_KEY, rawId);
        continue;
      }

      await flushSingleBlogCounters(blogId);
    }

    const dirtyDailyTokens = await redisClient.sMembers(DIRTY_DAILY_VIEWS_SET_KEY);
    for (const token of dirtyDailyTokens) {
      await flushSingleDailyView(token);
    }
  } catch (error) {
    console.error("Failed to flush blog counters:", error);
  } finally {
    try {
      const currentLockOwner = await redisClient.get(FLUSH_LOCK_KEY);
      if (currentLockOwner === lockToken) {
        await redisClient.del(FLUSH_LOCK_KEY);
      }
    } catch (error) {
      console.error("Failed to release counter flush lock:", error);
    }

    flushInProgress = false;
  }
};

export const startCounterFlushWorker = () => {
  if (workerStarted) {
    return;
  }

  workerStarted = true;
  const timer = setInterval(() => {
    void flushDirtyCountersNow();
  }, FLUSH_INTERVAL_MS);

  if (typeof timer.unref === "function") {
    timer.unref();
  }
};
