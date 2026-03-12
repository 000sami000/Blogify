import User, { IUser } from "../model/User.js";
import ProfileStar from "../model/ProfileStar.js";
import jwt, { JwtPayload } from "jsonwebtoken";
import TryCatch from "../utils/TryCatch.js";
import { AuthenticatedRequest } from "../middleware/isAuth.js";
import getBuffer from "../utils/dataUri.js";
import { v2 as cloudinary } from "cloudinary";
import { oauth2client } from "../utils/GoogleConfig.js";
import axios from "axios";
import bcrypt from "bcryptjs";
import { reserveProfileViewWindow } from "../utils/redis.js";
import { publishNotificationEvent } from "../utils/notificationQueue.js";
import {
  applyRealtimeProfileVisits,
  registerProfileVisit,
} from "../utils/profileVisitCounters.js";
import {
  applyRealtimeStarsCount,
  resolveProfileStarState,
  toggleProfileStarBuffered,
} from "../utils/profileStarCounters.js";

const PROFILE_VIEW_WINDOW_SECONDS = 30 * 60;

const getAdminEmails = () =>
  new Set(
    String(process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );

const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const isValidPassword = (value: string) => value.length >= 8 && value.length <= 128;

const buildDefaultAvatar = (name: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0D8ABC&color=fff`;

const issueToken = (user: unknown) =>
  jwt.sign({ user }, process.env.JWT_SEC as string, {
    expiresIn: "5d",
  });

const sanitizeUser = (user: IUser) => {
  const safe = user.toObject();
  delete (safe as { passwordHash?: string }).passwordHash;
  return safe;
};

const parsePositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const getDateRange = (period: "weekly" | "monthly" | "yearly") => {
  const now = new Date();
  const start = new Date(now);

  if (period === "weekly") {
    start.setDate(now.getDate() - 7);
  } else if (period === "monthly") {
    start.setMonth(now.getMonth() - 1);
  } else {
    start.setFullYear(now.getFullYear() - 1);
  }

  return {
    start,
    end: now,
  };
};

type InsightGranularity = "day" | "month" | "year";

const parseInsightGranularity = (value: unknown): InsightGranularity => {
  if (value === "day") {
    return "day";
  }

  if (value === "year") {
    return "year";
  }

  return "month";
};

const parseDate = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

const toUtcDateOnly = (value: Date) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const addUtcDays = (value: Date, days: number) => {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const parseMonthParam = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const raw = value.trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) {
    return null;
  }

  const [yearRaw, monthRaw] = raw.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
    return null;
  }

  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  return { start, end };
};

const resolveInsightsRange = (
  query: Record<string, unknown>,
  granularity: InsightGranularity
) => {
  const monthRange = parseMonthParam(query.month);
  if (monthRange) {
    return monthRange;
  }

  const from = parseDate(query.from);
  const to = parseDate(query.to);
  if (from && to && from <= to) {
    const start = toUtcDateOnly(from);
    const end = addUtcDays(toUtcDateOnly(to), 1);
    return { start, end };
  }

  const end = addUtcDays(toUtcDateOnly(new Date()), 1);
  const start = new Date(end);
  if (granularity === "day") {
    start.setUTCDate(start.getUTCDate() - 30);
  } else if (granularity === "month") {
    start.setUTCFullYear(start.getUTCFullYear() - 1);
  } else {
    start.setUTCFullYear(start.getUTCFullYear() - 5);
  }

  return { start, end };
};

const getRequesterIdFromAuthHeader = (authorizationHeader: unknown) => {
  if (typeof authorizationHeader !== "string") {
    return null;
  }

  if (!authorizationHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authorizationHeader.slice(7).trim();
  if (!token) {
    return null;
  }

  try {
    const decodedValue = jwt.verify(
      token,
      process.env.JWT_SEC as string
    ) as JwtPayload & { user?: { _id?: unknown } };
    const requesterId = decodedValue?.user?._id;

    if (!requesterId) {
      return null;
    }

    return String(requesterId);
  } catch {
    return null;
  }
};

const VISITOR_ID_COOKIE = "visitor_id";
const VISITOR_ID_PATTERN = /^v_[a-zA-Z0-9_-]{16,128}$/;

const normalizeVisitorId = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return VISITOR_ID_PATTERN.test(trimmed) ? trimmed : null;
};

const readCookieValue = (cookieHeader: string, name: string) => {
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [rawKey, ...rest] = part.split("=");
    if (rawKey?.trim() !== name) {
      continue;
    }
    return decodeURIComponent(rest.join("=").trim());
  }
  return null;
};

const getVisitorIdFromRequest = (req: { headers: Record<string, unknown> }) => {
  const rawHeaderValue = req.headers["x-visitor-id"];

  if (typeof rawHeaderValue === "string") {
    return normalizeVisitorId(rawHeaderValue);
  }

  if (Array.isArray(rawHeaderValue) && typeof rawHeaderValue[0] === "string") {
    return normalizeVisitorId(rawHeaderValue[0]);
  }

  const rawCookieHeader = req.headers.cookie;
  if (typeof rawCookieHeader === "string") {
    return normalizeVisitorId(readCookieValue(rawCookieHeader, VISITOR_ID_COOKIE));
  }

  if (Array.isArray(rawCookieHeader) && typeof rawCookieHeader[0] === "string") {
    return normalizeVisitorId(readCookieValue(rawCookieHeader[0], VISITOR_ID_COOKIE));
  }

  return null;
};

export const loginUser = TryCatch(async (req, res) => {
  const { code } = req.body;

  if (!code) {
    res.status(400).json({
      message: "Authorization code is required",
    });
    return;
  }

  const googleRes = await oauth2client.getToken(code);

  oauth2client.setCredentials(googleRes.tokens);

  const userRes = await axios.get(
    `https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${googleRes.tokens.access_token}`
  );

  const { email, name, picture } = userRes.data;

  const adminEmails = getAdminEmails();
  const isAdminEmail = adminEmails.has(String(email).toLowerCase());

  let user = await User.findOne({ email });

  if (!user) {
    user = await User.create({
      name,
      email,
      image: picture,
      role: isAdminEmail ? "admin" : "user",
      authProvider: "google",
    });
  } else {
    let shouldSave = false;

    if (user.authProvider === "local") {
      res.status(409).json({
        message: "This email is registered with password login. Use email/password to sign in.",
      });
      return;
    }

    if (!user.authProvider) {
      user.authProvider = "google";
      shouldSave = true;
    }

    if (!user.role) {
      user.role = isAdminEmail ? "admin" : "user";
      shouldSave = true;
    } else if (isAdminEmail && user.role !== "admin") {
      user.role = "admin";
      shouldSave = true;
    }

    if (typeof user.isBanned !== "boolean") {
      user.isBanned = false;
      shouldSave = true;
    }

    if (typeof user.isActive !== "boolean") {
      user.isActive = true;
      shouldSave = true;
    }

    if (typeof user.profileVisits !== "number") {
      user.profileVisits = 0;
      shouldSave = true;
    }

    if (typeof user.starsCount !== "number") {
      user.starsCount = 0;
      shouldSave = true;
    }

    if (shouldSave) {
      await user.save();
    }
  }

  if (!user.isActive) {
    res.status(403).json({
      message: "Your account is inactive",
    });
    return;
  }

  if (user.isBanned) {
    res.status(403).json({
      message: "Your account is banned",
    });
    return;
  }

  const safeUser = sanitizeUser(user);
  const token = issueToken(safeUser);

  res.status(200).json({
    message: "Login success",
    token,
    user: safeUser,
  });
});

export const registerWithEmail = TryCatch(async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!name || name.length < 2) {
    res.status(400).json({
      message: "Name is required (min 2 characters).",
    });
    return;
  }

  if (!isValidEmail(email)) {
    res.status(400).json({
      message: "Valid email is required.",
    });
    return;
  }

  if (!isValidPassword(password)) {
    res.status(400).json({
      message: "Password must be at least 8 characters.",
    });
    return;
  }

  const existing = await User.findOne({ email }).select("authProvider");
  if (existing) {
    res.status(409).json({
      message:
        existing.authProvider === "google"
          ? "Email already used with Google login. Use Google to sign in."
          : "Email already registered. Please login.",
    });
    return;
  }

  const adminEmails = getAdminEmails();
  const isAdminEmail = adminEmails.has(email);

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await User.create({
    name,
    email,
    image: buildDefaultAvatar(name),
    role: isAdminEmail ? "admin" : "user",
    authProvider: "local",
    passwordHash,
  });

  const safeUser = sanitizeUser(user);
  const token = issueToken(safeUser);

  res.status(201).json({
    message: "Account created successfully",
    token,
    user: safeUser,
  });
});

export const loginWithEmail = TryCatch(async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!isValidEmail(email)) {
    res.status(400).json({
      message: "Valid email is required.",
    });
    return;
  }

  if (!password) {
    res.status(400).json({
      message: "Password is required.",
    });
    return;
  }

  const user = await User.findOne({ email }).select("+passwordHash");

  if (!user || user.authProvider === "google" || !user.passwordHash) {
    res.status(401).json({
      message: "Invalid email or password.",
    });
    return;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({
      message: "Invalid email or password.",
    });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({
      message: "Your account is inactive",
    });
    return;
  }

  if (user.isBanned) {
    res.status(403).json({
      message: "Your account is banned",
    });
    return;
  }

  const safeUser = sanitizeUser(user);
  const token = issueToken(safeUser);

  res.status(200).json({
    message: "Login success",
    token,
    user: safeUser,
  });
});

export const myProfile = TryCatch(async (req: AuthenticatedRequest, res) => {
  const userId = req.user?._id;

  if (!userId) {
    res.status(401).json({
      message: "Unauthorized",
    });
    return;
  }

  const user = await User.findById(userId);

  if (!user) {
    res.status(404).json({
      message: "No user with this id",
    });
    return;
  }

  res.json(user);
});

export const getUserProfile = TryCatch(async (req, res) => {
  const profileUserId = String(req.params.id ?? "");
  const shouldIncrementVisitRequested =
    req.query.incrementVisit === "1" || req.query.incrementVisit === "true";
  const requesterId = getRequesterIdFromAuthHeader(req.headers.authorization);
  const isSelfProfileView =
    Boolean(requesterId) && String(requesterId) === String(profileUserId);
  let shouldIncrementVisit = shouldIncrementVisitRequested && !isSelfProfileView;

  if (shouldIncrementVisit) {
    const visitorId = getVisitorIdFromRequest(req);
    const viewerIdentity = requesterId
      ? `user:${requesterId}`
      : visitorId
        ? `visitor:${visitorId}`
        : null;

    if (!viewerIdentity) {
      shouldIncrementVisit = false;
    } else {
      const throttleKey = `user:profile:${profileUserId}:viewed:${viewerIdentity}`;
      shouldIncrementVisit = await reserveProfileViewWindow(
        throttleKey,
        PROFILE_VIEW_WINDOW_SECONDS
      );
    }
  }

  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404).json({
      message: "No user with this id",
    });
    return;
  }

  let appliedMode: "redis" | "db" | "none" = "none";
  let appliedIncrement = false;

  if (shouldIncrementVisit) {
    const result = await registerProfileVisit(profileUserId);
    appliedMode = result.mode;
    appliedIncrement = result.incremented;
  }

  const persistedProfileVisits =
    typeof user.profileVisits === "number" ? user.profileVisits : 0;
  const profileVisits =
    appliedMode === "db" && appliedIncrement
      ? persistedProfileVisits + 1
      : await applyRealtimeProfileVisits(profileUserId, persistedProfileVisits);

  const persistedStarsCount =
    typeof user.starsCount === "number" ? user.starsCount : 0;

  const [viewerStarred, realtimeStarsCount] = await Promise.all([
    requesterId
      ? resolveProfileStarState(profileUserId, requesterId)
      : Promise.resolve(false),
    applyRealtimeStarsCount(profileUserId, persistedStarsCount),
  ]);

  let starsCount = realtimeStarsCount;
  if (persistedStarsCount === 0) {
    const dbCount = await ProfileStar.countDocuments({
      targetUserId: profileUserId,
    });
    if (dbCount > 0) {
      await User.updateOne(
        { _id: profileUserId },
        { $set: { starsCount: dbCount } }
      );
      starsCount = await applyRealtimeStarsCount(profileUserId, dbCount);
    }
  }

  res.json({
    ...user.toObject(),
    profileVisits: Math.max(0, profileVisits),
    starsCount,
    viewerStarred: Boolean(viewerStarred),
  });
});

export const updateUser = TryCatch(async (req: AuthenticatedRequest, res) => {
  const { name, instagram, facebook, linkedin, bio } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      name,
      instagram,
      facebook,
      linkedin,
      bio,
    },
    { new: true }
  );

  const token = jwt.sign({ user }, process.env.JWT_SEC as string, {
    expiresIn: "5d",
  });

  res.json({
    message: "User Updated",
    token,
    user,
  });
});

export const updateProfilePic = TryCatch(
  async (req: AuthenticatedRequest, res) => {
    const file = req.file;

    if (!file) {
      res.status(400).json({
        message: "No file to upload",
      });
      return;
    }

    const fileBuffer = getBuffer(file);

    if (!fileBuffer || !fileBuffer.content) {
      res.status(400).json({
        message: "Failed to generate buffer",
      });
      return;
    }
    const cloud = await cloudinary.uploader.upload(fileBuffer.content, {
      folder: "blogs",
    });

    const user = await User.findByIdAndUpdate(
      req.user?._id,
      {
        image: cloud.secure_url,
      },
      { new: true }
    );

    const token = jwt.sign({ user }, process.env.JWT_SEC as string, {
      expiresIn: "5d",
    });

    res.json({
      message: "User Profile pic updated",
      token,
      user,
    });
  }
);

export const updateProfileBanner = TryCatch(
  async (req: AuthenticatedRequest, res) => {
    const file = req.file;

    if (!file) {
      res.status(400).json({
        message: "No file to upload",
      });
      return;
    }

    const fileBuffer = getBuffer(file);

    if (!fileBuffer || !fileBuffer.content) {
      res.status(400).json({
        message: "Failed to generate buffer",
      });
      return;
    }

    const cloud = await cloudinary.uploader.upload(fileBuffer.content, {
      folder: "blogs/banner",
    });

    const user = await User.findByIdAndUpdate(
      req.user?._id,
      {
        banner: cloud.secure_url,
      },
      { new: true }
    );

    const token = jwt.sign({ user }, process.env.JWT_SEC as string, {
      expiresIn: "5d",
    });

    res.json({
      message: "Profile banner updated",
      token,
      user,
    });
  }
);

export const toggleProfileStar = TryCatch(async (req: AuthenticatedRequest, res) => {
  const targetUserId = String(req.params.id ?? "");
  const viewerUserId = req.user?._id ? String(req.user._id) : "";

  if (!viewerUserId) {
    res.status(401).json({
      message: "Unauthorized",
    });
    return;
  }

  if (!targetUserId) {
    res.status(400).json({
      message: "Missing target user id",
    });
    return;
  }

  if (targetUserId === viewerUserId) {
    res.status(400).json({
      message: "You cannot star your own profile",
    });
    return;
  }

  const targetUser = await User.findById(targetUserId).select("_id starsCount");
  if (!targetUser) {
    res.status(404).json({
      message: "No user with this id",
    });
    return;
  }

  const { starred } = await toggleProfileStarBuffered(targetUserId, viewerUserId);
  const currentStarsCount = await applyRealtimeStarsCount(
    targetUserId,
    typeof targetUser.starsCount === "number" ? targetUser.starsCount : 0
  );

  if (starred) {
    void publishNotificationEvent({
      type: "profile_star",
      recipientUserId: targetUserId,
      actorUserId: viewerUserId,
      actorName: req.user?.name || "Someone",
      message: `${req.user?.name || "Someone"} starred your profile`,
      createdAt: new Date().toISOString(),
      metadata: {
        targetUserId,
      },
    });
  }

  res.json({
    message: starred ? "Profile starred" : "Profile unstarred",
    starred,
    starsCount: currentStarsCount,
  });
});

export const getAdminUsers = TryCatch(async (req, res) => {
  const page = parsePositiveInt(req.query.page, 1);
  const requestedLimit = parsePositiveInt(req.query.limit, 20);
  const limit = Math.min(requestedLimit, 100);
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const role = typeof req.query.role === "string" ? req.query.role.trim() : "";
  const status =
    typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "";

  const filters: Record<string, unknown> = {};

  if (search) {
    filters.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  if (role === "admin" || role === "user") {
    filters.role = role;
  }

  if (status === "active") {
    filters.isActive = true;
    filters.isBanned = false;
  } else if (status === "inactive") {
    filters.isActive = false;
  } else if (status === "banned") {
    filters.isBanned = true;
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    User.find(filters)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("-__v"),
    User.countDocuments(filters),
  ]);

  res.json({
    items,
    page,
    limit,
    total,
    hasMore: page * limit < total,
  });
});

export const setUserBanStatus = TryCatch(async (req: AuthenticatedRequest, res) => {
  const userId = req.params.id;
  const isBanned = Boolean(req.body.isBanned);
  const actorId = req.user?._id;

  if (!userId) {
    res.status(400).json({
      message: "Missing user id",
    });
    return;
  }

  if (actorId && String(actorId) === String(userId) && isBanned) {
    res.status(400).json({
      message: "Admin cannot ban themselves",
    });
    return;
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { isBanned },
    { new: true }
  ).select("-__v");

  if (!user) {
    res.status(404).json({
      message: "No user with this id",
    });
    return;
  }

  res.json({
    message: isBanned ? "User banned" : "User unbanned",
    user,
  });
});

export const setUserActiveStatus = TryCatch(async (req: AuthenticatedRequest, res) => {
  const userId = req.params.id;
  const isActive = Boolean(req.body.isActive);
  const actorId = req.user?._id;

  if (!userId) {
    res.status(400).json({
      message: "Missing user id",
    });
    return;
  }

  if (actorId && String(actorId) === String(userId) && !isActive) {
    res.status(400).json({
      message: "Admin cannot deactivate themselves",
    });
    return;
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { isActive },
    { new: true }
  ).select("-__v");

  if (!user) {
    res.status(404).json({
      message: "No user with this id",
    });
    return;
  }

  res.json({
    message: isActive ? "User activated" : "User deactivated",
    user,
  });
});

export const getUserInsights = TryCatch(async (req, res) => {
  const granularity = parseInsightGranularity(req.query.granularity);
  const { start, end } = resolveInsightsRange(req.query, granularity);

  const [totalUsers, weeklyUsers, monthlyUsers, yearlyUsers] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: getDateRange("weekly").start } }),
    User.countDocuments({ createdAt: { $gte: getDateRange("monthly").start } }),
    User.countDocuments({ createdAt: { $gte: getDateRange("yearly").start } }),
  ]);

  const bucketFormat =
    granularity === "day" ? "%Y-%m-%d" : granularity === "year" ? "%Y" : "%Y-%m";

  const registrations = await User.aggregate([
    {
      $match: {
        createdAt: {
          $gte: start,
          $lt: end,
        },
      },
    },
    {
      $group: {
        _id: {
          bucket: {
            $dateToString: {
              format: bucketFormat,
              date: "$createdAt",
            },
          },
        },
        count: { $sum: 1 },
      },
    },
    {
      $sort: {
        "_id.bucket": 1,
      },
    },
  ]);

  const activeUsers = await User.countDocuments({ isActive: true, isBanned: false });
  const bannedUsers = await User.countDocuments({ isBanned: true });
  const inactiveUsers = await User.countDocuments({ isActive: false });
  const adminUsers = await User.countDocuments({ role: "admin" });

  res.json({
    totals: {
      users: totalUsers,
      activeUsers,
      bannedUsers,
      inactiveUsers,
      adminUsers,
    },
    periods: {
      weekly: weeklyUsers,
      monthly: monthlyUsers,
      yearly: yearlyUsers,
    },
    series: {
      granularity,
      range: {
        start,
        end,
      },
      registrations: registrations.map((item) => ({
        bucket: item?._id?.bucket,
        count: item?.count ?? 0,
      })),
    },
  });
});
