import mongoose from "mongoose";
import User from "../model/User.js";
import { getRedisClient } from "./redis.js";
import { publishProfileVisitFlushJob } from "./profileVisitQueue.js";

const DIRTY_PROFILE_VISITS_SET_KEY = "users:profile:visits:dirty";
const PROFILE_VISITS_LOCK_KEY = "users:profile:visits:flush:lock";
const PROFILE_VISITS_NOTIFY_KEY = (userId: string) =>
  `user:${userId}:profile:visits:flush:notify`;
const PROFILE_VISITS_COUNTER_KEY = (userId: string) =>
  `user:${userId}:profile:counter`;

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

const incrementProfileVisitInDb = async (userId: string) => {
  const result = await User.updateOne(
    { _id: userId },
    {
      $inc: { profileVisits: 1 },
    }
  );

  return (result.matchedCount ?? 0) > 0;
};

const queueFlushJobIfNeeded = async (userId: string) => {
  const redisClient = getRedisClient();
  if (!redisClient?.isOpen) {
    return;
  }

  const shouldNotify = await redisClient.set(PROFILE_VISITS_NOTIFY_KEY(userId), "1", {
    NX: true,
    EX: 2,
  });

  if (shouldNotify !== "OK") {
    return;
  }

  void publishProfileVisitFlushJob({
    userId,
    reason: "profile_view",
    emittedAt: new Date().toISOString(),
  });
};

export type RegisterProfileVisitResult = {
  incremented: boolean;
  mode: "redis" | "db" | "none";
};

export const registerProfileVisit = async (
  profileUserId: string
): Promise<RegisterProfileVisitResult> => {
  const userId = normalizeUserId(profileUserId);
  if (!userId) {
    return {
      incremented: false,
      mode: "none",
    };
  }

  const redisClient = getRedisClient();
  if (!redisClient?.isOpen) {
    const incremented = await incrementProfileVisitInDb(userId);
    return {
      incremented,
      mode: incremented ? "db" : "none",
    };
  }

  try {
    await redisClient.hIncrBy(PROFILE_VISITS_COUNTER_KEY(userId), "visitsDelta", 1);
    await redisClient.sAdd(DIRTY_PROFILE_VISITS_SET_KEY, userId);
    await queueFlushJobIfNeeded(userId);
    return {
      incremented: true,
      mode: "redis",
    };
  } catch (error) {
    console.error("Failed to buffer profile visit in redis. Falling back to DB write:", error);
    const incremented = await incrementProfileVisitInDb(userId);
    return {
      incremented,
      mode: incremented ? "db" : "none",
    };
  }
};

export const applyRealtimeProfileVisits = async (
  profileUserId: string,
  persistedProfileVisits: number
) => {
  const userId = normalizeUserId(profileUserId);
  const safePersistedValue = Math.max(0, toInt(persistedProfileVisits));

  if (!userId) {
    return safePersistedValue;
  }

  const redisClient = getRedisClient();
  if (!redisClient?.isOpen) {
    return safePersistedValue;
  }

  try {
    const rawDelta = await redisClient.hGet(PROFILE_VISITS_COUNTER_KEY(userId), "visitsDelta");
    const delta = toInt(rawDelta);
    return Math.max(0, safePersistedValue + delta);
  } catch (error) {
    console.error("Failed to read realtime profile visits delta:", error);
    return safePersistedValue;
  }
};

const flushSingleProfileVisitCounter = async (userId: string) => {
  const redisClient = getRedisClient();
  if (!redisClient?.isOpen) {
    return;
  }

  const counterKey = PROFILE_VISITS_COUNTER_KEY(userId);
  const rawDelta = await redisClient.hGet(counterKey, "visitsDelta");
  const delta = toInt(rawDelta);

  if (delta <= 0) {
    await redisClient.del(counterKey);
    await redisClient.sRem(DIRTY_PROFILE_VISITS_SET_KEY, userId);
    return;
  }

  await redisClient.hIncrBy(counterKey, "visitsDelta", -delta);

  try {
    const result = await User.updateOne(
      { _id: userId },
      {
        $inc: {
          profileVisits: delta,
        },
      }
    );

    if ((result.matchedCount ?? 0) === 0) {
      await redisClient.del(counterKey);
      await redisClient.sRem(DIRTY_PROFILE_VISITS_SET_KEY, userId);
      return;
    }
  } catch (error) {
    await redisClient.hIncrBy(counterKey, "visitsDelta", delta);
    await redisClient.sAdd(DIRTY_PROFILE_VISITS_SET_KEY, userId);
    throw error;
  }

  const remainingRaw = await redisClient.hGet(counterKey, "visitsDelta");
  const remainingDelta = toInt(remainingRaw);

  if (remainingDelta <= 0) {
    await redisClient.del(counterKey);
    await redisClient.sRem(DIRTY_PROFILE_VISITS_SET_KEY, userId);
  } else {
    await redisClient.sAdd(DIRTY_PROFILE_VISITS_SET_KEY, userId);
  }
};

let flushInProgress = false;

export const flushDirtyProfileVisitsNow = async () => {
  const redisClient = getRedisClient();
  if (!redisClient?.isOpen || flushInProgress) {
    return;
  }

  const lockToken = `${process.pid}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const lockAcquired = await redisClient.set(PROFILE_VISITS_LOCK_KEY, lockToken, {
    NX: true,
    EX: 15,
  });

  if (lockAcquired !== "OK") {
    return;
  }

  flushInProgress = true;
  try {
    const dirtyUserIds = await redisClient.sMembers(DIRTY_PROFILE_VISITS_SET_KEY);
    for (const rawUserId of dirtyUserIds) {
      const normalizedUserId = normalizeUserId(rawUserId);
      if (!normalizedUserId) {
        await redisClient.sRem(DIRTY_PROFILE_VISITS_SET_KEY, rawUserId);
        continue;
      }

      await flushSingleProfileVisitCounter(normalizedUserId);
    }
  } catch (error) {
    console.error("Failed to flush profile visit counters:", error);
  } finally {
    try {
      const currentLockOwner = await redisClient.get(PROFILE_VISITS_LOCK_KEY);
      if (currentLockOwner === lockToken) {
        await redisClient.del(PROFILE_VISITS_LOCK_KEY);
      }
    } catch (error) {
      console.error("Failed to release profile visit flush lock:", error);
    }

    flushInProgress = false;
  }
};

