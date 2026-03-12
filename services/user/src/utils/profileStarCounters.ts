import mongoose from "mongoose";
import User from "../model/User.js";
import ProfileStar from "../model/ProfileStar.js";
import { getRedisClient } from "./redis.js";
import { publishProfileStarFlushJob } from "./profileStarQueue.js";

const DIRTY_PROFILE_STARS_SET_KEY = "users:profile:stars:dirty";
const PROFILE_STARS_LOCK_KEY = "users:profile:stars:flush:lock";
const PROFILE_STARS_NOTIFY_KEY = (userId: string) =>
  `user:${userId}:profile:stars:flush:notify`;
const PROFILE_STARS_COUNTER_KEY = (userId: string) =>
  `user:${userId}:stars:counter`;
const PROFILE_STARS_ADD_KEY = (userId: string) =>
  `user:${userId}:stars:add`;
const PROFILE_STARS_REMOVE_KEY = (userId: string) =>
  `user:${userId}:stars:remove`;

const toInt = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.trunc(parsed);
};

const normalizeUserId = (userId: string) => {
  const trimmed = String(userId || "").trim();
  if (!trimmed || !mongoose.isValidObjectId(trimmed)) {
    return null;
  }
  return trimmed;
};

const queueFlushJobIfNeeded = async (userId: string) => {
  const redisClient = getRedisClient();
  if (!redisClient?.isOpen) {
    return;
  }

  const shouldNotify = await redisClient.set(PROFILE_STARS_NOTIFY_KEY(userId), "1", {
    NX: true,
    EX: 2,
  });

  if (shouldNotify !== "OK") {
    return;
  }

  void publishProfileStarFlushJob({
    userId,
    reason: "profile_star",
    emittedAt: new Date().toISOString(),
  });
};

const resolveStarStateInDb = async (targetUserId: string, viewerUserId: string) => {
  return ProfileStar.exists({
    targetUserId,
    viewerUserId,
  });
};

const updateStarsCountInDb = async (targetUserId: string, delta: number) => {
  if (delta === 0) {
    return;
  }

  await User.updateOne(
    { _id: targetUserId },
    [
      {
        $set: {
          starsCount: {
            $max: [0, { $add: ["$starsCount", delta] }],
          },
        },
      },
    ]
    ,
    { updatePipeline: true }
  );
};

export const resolveProfileStarState = async (
  targetUserId: string,
  viewerUserId: string
) => {
  const redisClient = getRedisClient();
  if (!redisClient?.isOpen) {
    return Boolean(await resolveStarStateInDb(targetUserId, viewerUserId));
  }

  const [pendingAdd, pendingRemove] = await Promise.all([
    redisClient.sIsMember(PROFILE_STARS_ADD_KEY(targetUserId), viewerUserId),
    redisClient.sIsMember(PROFILE_STARS_REMOVE_KEY(targetUserId), viewerUserId),
  ]);

  if (pendingAdd) {
    return true;
  }

  if (pendingRemove) {
    return false;
  }

  return Boolean(await resolveStarStateInDb(targetUserId, viewerUserId));
};

export type ToggleProfileStarResult = {
  starred: boolean;
  mode: "redis" | "db";
};

export const toggleProfileStarBuffered = async (
  targetUserId: string,
  viewerUserId: string
): Promise<ToggleProfileStarResult> => {
  const redisClient = getRedisClient();

  if (!redisClient?.isOpen) {
    const removed = await ProfileStar.findOneAndDelete({
      targetUserId,
      viewerUserId,
    });

    if (!removed) {
      try {
        await ProfileStar.create({
          targetUserId,
          viewerUserId,
        });
        await updateStarsCountInDb(targetUserId, 1);
        return { starred: true, mode: "db" };
      } catch (error: any) {
        if (error?.code === 11000) {
          await updateStarsCountInDb(targetUserId, 0);
          return { starred: true, mode: "db" };
        }
        throw error;
      }
    }

    await updateStarsCountInDb(targetUserId, -1);
    return { starred: false, mode: "db" };
  }

  const alreadyStarred = await resolveProfileStarState(targetUserId, viewerUserId);
  const counterKey = PROFILE_STARS_COUNTER_KEY(targetUserId);
  const addKey = PROFILE_STARS_ADD_KEY(targetUserId);
  const removeKey = PROFILE_STARS_REMOVE_KEY(targetUserId);

  const multi = redisClient.multi();

  if (alreadyStarred) {
    multi.sAdd(removeKey, viewerUserId);
    multi.sRem(addKey, viewerUserId);
    multi.hIncrBy(counterKey, "starsDelta", -1);
  } else {
    multi.sAdd(addKey, viewerUserId);
    multi.sRem(removeKey, viewerUserId);
    multi.hIncrBy(counterKey, "starsDelta", 1);
  }

  multi.sAdd(DIRTY_PROFILE_STARS_SET_KEY, targetUserId);
  await multi.exec();
  await queueFlushJobIfNeeded(targetUserId);

  return {
    starred: !alreadyStarred,
    mode: "redis",
  };
};

export const applyRealtimeStarsCount = async (
  targetUserId: string,
  persistedStarsCount: number
) => {
  const userId = normalizeUserId(targetUserId);
  const safePersistedValue = Math.max(0, toInt(persistedStarsCount));

  if (!userId) {
    return safePersistedValue;
  }

  const redisClient = getRedisClient();
  if (!redisClient?.isOpen) {
    return safePersistedValue;
  }

  try {
    const rawDelta = await redisClient.hGet(PROFILE_STARS_COUNTER_KEY(userId), "starsDelta");
    const delta = toInt(rawDelta);
    return Math.max(0, safePersistedValue + delta);
  } catch (error) {
    console.error("Failed to read realtime star delta:", error);
    return safePersistedValue;
  }
};

const flushSingleProfileStarCounter = async (targetUserId: string) => {
  const redisClient = getRedisClient();
  if (!redisClient?.isOpen) {
    return;
  }

  const counterKey = PROFILE_STARS_COUNTER_KEY(targetUserId);
  const addKey = PROFILE_STARS_ADD_KEY(targetUserId);
  const removeKey = PROFILE_STARS_REMOVE_KEY(targetUserId);

  const [rawDelta, adds, removes] = await Promise.all([
    redisClient.hGet(counterKey, "starsDelta"),
    redisClient.sMembers(addKey),
    redisClient.sMembers(removeKey),
  ]);

  const delta = toInt(rawDelta);

  if (delta === 0 && adds.length === 0 && removes.length === 0) {
    await redisClient.del([counterKey, addKey, removeKey]);
    await redisClient.sRem(DIRTY_PROFILE_STARS_SET_KEY, targetUserId);
    return;
  }

  if (delta !== 0) {
    await redisClient.hIncrBy(counterKey, "starsDelta", -delta);
  }

  try {
    await updateStarsCountInDb(targetUserId, delta);

    if (adds.length > 0) {
      const addOps = adds.map((viewerUserId) => ({
        updateOne: {
          filter: { targetUserId, viewerUserId },
          update: { $setOnInsert: { targetUserId, viewerUserId } },
          upsert: true,
        },
      }));
      await ProfileStar.bulkWrite(addOps, { ordered: false });
    }

    if (removes.length > 0) {
      await ProfileStar.deleteMany({
        targetUserId,
        viewerUserId: { $in: removes },
      });
    }
  } catch (error) {
    if (delta !== 0) {
      await redisClient.hIncrBy(counterKey, "starsDelta", delta);
    }
    await redisClient.sAdd(DIRTY_PROFILE_STARS_SET_KEY, targetUserId);
    throw error;
  }

  if (adds.length > 0) {
    await redisClient.sRem(addKey, adds);
  }

  if (removes.length > 0) {
    await redisClient.sRem(removeKey, removes);
  }

  const remainingRaw = await redisClient.hGet(counterKey, "starsDelta");
  const remainingDelta = toInt(remainingRaw);

  if (remainingDelta === 0) {
    await redisClient.del([counterKey, addKey, removeKey]);
    await redisClient.sRem(DIRTY_PROFILE_STARS_SET_KEY, targetUserId);
  } else {
    await redisClient.sAdd(DIRTY_PROFILE_STARS_SET_KEY, targetUserId);
  }
};

let flushInProgress = false;

export const flushDirtyProfileStarsNow = async () => {
  const redisClient = getRedisClient();
  if (!redisClient?.isOpen || flushInProgress) {
    return;
  }

  const lockToken = `${process.pid}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const lockAcquired = await redisClient.set(PROFILE_STARS_LOCK_KEY, lockToken, {
    NX: true,
    EX: 15,
  });

  if (lockAcquired !== "OK") {
    return;
  }

  flushInProgress = true;
  try {
    const dirtyUserIds = await redisClient.sMembers(DIRTY_PROFILE_STARS_SET_KEY);

    for (const rawUserId of dirtyUserIds) {
      const normalizedUserId = normalizeUserId(rawUserId);
      if (!normalizedUserId) {
        await redisClient.sRem(DIRTY_PROFILE_STARS_SET_KEY, rawUserId);
        continue;
      }

      await flushSingleProfileStarCounter(normalizedUserId);
    }
  } catch (error) {
    console.error("Failed to flush profile star counters:", error);
  } finally {
    try {
      const currentLockOwner = await redisClient.get(PROFILE_STARS_LOCK_KEY);
      if (currentLockOwner === lockToken) {
        await redisClient.del(PROFILE_STARS_LOCK_KEY);
      }
    } catch (error) {
      console.error("Failed to release profile star flush lock:", error);
    }

    flushInProgress = false;
  }
};
