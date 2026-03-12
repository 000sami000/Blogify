import { AuthenticatedRequest } from "../middleware/isAuth.js";
import { redisClient } from "../utils/redis.js";
import { AppDataSource } from "../utils/db.js";
import TryCatch from "../utils/TryCatch.js";
import axios from "axios";
import jwt, { JwtPayload } from "jsonwebtoken";
import { Blog } from "../entities/Blog.js";
import { BlogLike } from "../entities/BlogLike.js";
import { BlogReport } from "../entities/BlogReport.js";
import { SavedBlog } from "../entities/SavedBlog.js";
import { In, MoreThanOrEqual } from "typeorm";
import {
  applyRealtimeCountersToBlog,
  applyRealtimeCountersToBlogs,
  getCounterDelta,
  isLikedByUser,
  registerUniqueView,
  toggleLike,
} from "../utils/counters.js";
import { publishNotificationEvent } from "../utils/counterQueue.js";

const isRedisUnavailableError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("redis") &&
    (message.includes("not connected") ||
      message.includes("client is closed") ||
      message.includes("socket"))
  );
};

const parsePositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const parseBooleanFlag = (value: unknown) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true";
  }

  return false;
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

  return { start, end: now };
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

const getVisitorIdFromHeaders = (headers: Record<string, unknown>) => {
  const rawHeaderValue = headers["x-visitor-id"];

  if (typeof rawHeaderValue === "string") {
    return normalizeVisitorId(rawHeaderValue);
  }

  if (Array.isArray(rawHeaderValue) && typeof rawHeaderValue[0] === "string") {
    return normalizeVisitorId(rawHeaderValue[0]);
  }

  const rawCookieHeader = headers.cookie;
  if (typeof rawCookieHeader === "string") {
    return normalizeVisitorId(readCookieValue(rawCookieHeader, VISITOR_ID_COOKIE));
  }

  if (Array.isArray(rawCookieHeader) && typeof rawCookieHeader[0] === "string") {
    return normalizeVisitorId(readCookieValue(rawCookieHeader[0], VISITOR_ID_COOKIE));
  }

  return null;
};

const resolveBlogViewIdentity = (
  blogAuthorId: unknown,
  headers: Record<string, unknown>
) => {
  const requesterId = getRequesterIdFromAuthHeader(headers.authorization);

  if (requesterId) {
    // Count authenticated viewers uniformly (including author), with 30-minute dedupe.
    return `user:${requesterId}`;
  }

  const visitorId = getVisitorIdFromHeaders(headers);
  if (!visitorId) {
    return null;
  }

  return `visitor:${visitorId}`;
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

const buildBucketSelect = (column: string, granularity: InsightGranularity) => {
  if (granularity === "day") {
    return `DATE_TRUNC('day', ${column})`;
  }

  if (granularity === "year") {
    return `DATE_TRUNC('year', ${column})`;
  }

  return `DATE_TRUNC('month', ${column})`;
};

const toIsoBucket = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toISOString();
};

const buildDayList = (start: Date, end: Date) => {
  const days: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const limit = 4000;

  while (cursor < end && days.length < limit) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
};

const bucketForGranularity = (day: string, granularity: InsightGranularity) => {
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return day;
  }

  if (granularity === "year") {
    return new Date(Date.UTC(parsed.getUTCFullYear(), 0, 1)).toISOString();
  }

  if (granularity === "month") {
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1)).toISOString();
  }

  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate())).toISOString();
};

const toSafeNumber = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.trunc(parsed);
};

const sumRealtimeCountersForAuthor = async (
  blogRepo: ReturnType<typeof AppDataSource.getRepository<Blog>>,
  authorId: string,
  includeUnpublished: boolean
) => {
  if (!redisClient.isOpen) {
    return { viewsDelta: 0, likesDelta: 0 };
  }

  const qb = blogRepo
    .createQueryBuilder("blog")
    .select("blog.id", "id")
    .where("blog.author = :authorId", { authorId });

  if (!includeUnpublished) {
    qb.andWhere("blog.publishStatus = :publishStatus", {
      publishStatus: "published",
    });
    qb.andWhere("blog.isActive = :isActive", { isActive: true });
  }

  const rows = await qb.getRawMany<{ id: number }>();
  if (rows.length === 0) {
    return { viewsDelta: 0, likesDelta: 0 };
  }

  const multi = redisClient.multi();
  rows.forEach((row) => {
    const blogId = Number(row.id);
    if (!Number.isFinite(blogId)) {
      return;
    }
    const counterKey = `blog:${blogId}:counter`;
    multi.hGet(counterKey, "viewsDelta");
    multi.hGet(counterKey, "likesDelta");
  });

  const results = await multi.exec();
  let viewsDelta = 0;
  let likesDelta = 0;
  if (Array.isArray(results)) {
    results.forEach((value, index) => {
      const parsed = toSafeNumber(value);
      if (index % 2 === 0) {
        viewsDelta += parsed;
      } else {
        likesDelta += parsed;
      }
    });
  }

  return { viewsDelta, likesDelta };
};

const safeGetCache = async (key: string) => {
  if (!redisClient.isOpen) {
    return null;
  }

  try {
    return await redisClient.get(key);
  } catch {
    return null;
  }
};

const safeSetCache = async (key: string, value: unknown, ttlSeconds: number) => {
  if (!redisClient.isOpen) {
    return;
  }

  try {
    await redisClient.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch {
    // best-effort cache write
  }
};

const toggleLikeWithDbFallback = async (blogId: number, userId: string) => {
  return AppDataSource.transaction(async (manager) => {
    const likeRepo = manager.getRepository(BlogLike);
    const existing = await likeRepo.findOne({
      where: {
        blogId,
        userId,
      },
    });

    let liked = false;

    if (existing) {
      await likeRepo.delete({ blogId, userId });
      await manager.query(
        `
          UPDATE blogs
          SET likes_count = GREATEST(likes_count - 1, 0)
          WHERE id = $1
        `,
        [blogId]
      );
      liked = false;
    } else {
      await likeRepo.insert(
        likeRepo.create({
          blogId,
          userId,
        })
      );
      await manager.query(
        `
          UPDATE blogs
          SET likes_count = likes_count + 1
          WHERE id = $1
        `,
        [blogId]
      );
      liked = true;
    }

    const latest = await manager.getRepository(Blog).findOne({
      where: { id: blogId },
      select: {
        id: true,
        likesCount: true,
        viewsCount: true,
      },
    });

    return {
      liked,
      likesCount: Math.max(0, latest?.likesCount ?? 0),
      viewsCount: Math.max(0, latest?.viewsCount ?? 0),
    };
  });
};

const hydrateLatestCountersForBlogs = async (blogs: Blog[]) => {
  if (blogs.length === 0) {
    return blogs;
  }

  const ids = Array.from(
    new Set(
      blogs
        .map((blog) => Number(blog.id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );

  if (ids.length === 0) {
    return blogs;
  }

  const blogRepo = AppDataSource.getRepository(Blog);
  const latestCounters = await blogRepo.find({
    where: {
      id: In(ids),
    },
    select: {
      id: true,
      likesCount: true,
      viewsCount: true,
    },
  });

  const counterMap = new Map(
    latestCounters.map((item) => [
      item.id,
      { likesCount: item.likesCount, viewsCount: item.viewsCount },
    ])
  );

  for (const blog of blogs) {
    const snapshot = counterMap.get(Number(blog.id));
    if (!snapshot) {
      continue;
    }

    blog.likesCount = snapshot.likesCount;
    blog.viewsCount = snapshot.viewsCount;
  }

  return blogs;
};

export const getAllBlogs = TryCatch(async (req, res) => {
  const searchQuery =
    typeof req.query.searchQuery === "string" ? req.query.searchQuery : "";
  const category =
    typeof req.query.category === "string" ? req.query.category : "";
  const pageQuery = Number(req.query.page);
  const limitQuery = Number(req.query.limit);
  const shouldPaginate = Number.isFinite(pageQuery) || Number.isFinite(limitQuery);
  const page = Number.isFinite(pageQuery) && pageQuery > 0 ? pageQuery : 1;
  const limit =
    Number.isFinite(limitQuery) && limitQuery > 0
      ? Math.min(limitQuery, 50)
      : 10;

  const cacheKey = shouldPaginate
    ? `blogs:v2:${searchQuery}:${category}:page:${page}:limit:${limit}`
    : `blogs:v2:${searchQuery}:${category}`;

  const cached = await redisClient.get(cacheKey);

  if (cached) {
    console.log("Serving from Redis cache");
    const parsed = JSON.parse(cached);

    if (shouldPaginate) {
      const payload = parsed as {
        items: Blog[];
        page: number;
        limit: number;
        total: number;
        hasMore: boolean;
      };
      payload.items = payload.items.filter(
        (blog) => blog.publishStatus === "published" && blog.isActive !== false
      );
      await hydrateLatestCountersForBlogs(payload.items);
      await applyRealtimeCountersToBlogs(payload.items);
      res.json(payload);
      return;
    }

    const cachedBlogs = (parsed as Blog[]).filter(
      (blog) => blog.publishStatus === "published" && blog.isActive !== false
    );
    await hydrateLatestCountersForBlogs(cachedBlogs);
    await applyRealtimeCountersToBlogs(cachedBlogs);
    res.json(cachedBlogs);
    return;
  }

  const blogRepo = AppDataSource.getRepository(Blog);
  const qb = blogRepo.createQueryBuilder("blog");

  if (searchQuery) {
    qb.andWhere("(blog.title ILIKE :q OR blog.description ILIKE :q)", {
      q: `%${searchQuery}%`,
    });
  }

  if (category) {
    qb.andWhere("blog.category = :category", { category });
  }

  qb.andWhere("blog.publishStatus = :publishStatus", {
    publishStatus: "published",
  });
  qb.andWhere("blog.isActive = :isActive", {
    isActive: true,
  });

  if (shouldPaginate) {
    const [items, total] = await qb
      .orderBy("blog.createAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    await applyRealtimeCountersToBlogs(items);

    const payload = {
      items,
      page,
      limit,
      total,
      hasMore: page * limit < total,
    };

    console.log("Serving paginated blogs from db");
    await redisClient.set(cacheKey, JSON.stringify(payload), { EX: 3600 });
    res.json(payload);
    return;
  }

  const blogs = await qb.orderBy("blog.createAt", "DESC").getMany();
  await applyRealtimeCountersToBlogs(blogs);

  console.log("Serving from db");

  await redisClient.set(cacheKey, JSON.stringify(blogs), { EX: 3600 });

  res.json(blogs);
});

export const getSingleBlog = TryCatch(async (req, res) => {
  const blogid = Number(req.params.id);

  if (!Number.isFinite(blogid)) {
    res.status(400).json({
      message: "Invalid blog id",
    });
    return;
  }

  const cacheKey = `blog:v2:${blogid}`;
  const blogRepo = AppDataSource.getRepository(Blog);
  const resolveIdentityForRequest = (blogAuthorId: unknown) =>
    resolveBlogViewIdentity(blogAuthorId, req.headers as Record<string, unknown>);

  const cached = await redisClient.get(cacheKey);

  if (cached) {
    console.log("Serving single blog from Redis cache");
    const cachedData = JSON.parse(cached) as { blog: Blog; author: unknown };

    if (
      cachedData.blog.publishStatus !== "published" ||
      cachedData.blog.isActive === false
    ) {
      res.status(404).json({
        message: "no blog with this id",
      });
      return;
    }

    const latestCounters = await blogRepo.findOne({
      where: { id: blogid },
      select: {
        id: true,
        viewsCount: true,
        likesCount: true,
      },
    });

    if (latestCounters) {
      cachedData.blog = {
        ...cachedData.blog,
        viewsCount: latestCounters.viewsCount,
        likesCount: latestCounters.likesCount,
      };
    }

    const viewerIdentity = resolveIdentityForRequest(cachedData.blog.author);
    if (viewerIdentity) {
      await registerUniqueView(blogid, viewerIdentity);
    }
    const blogWithRealtimeCounter = await applyRealtimeCountersToBlog({
      ...cachedData.blog,
    } as Blog);

    res.json({
      ...cachedData,
      blog: blogWithRealtimeCounter,
    });
    return;
  }

  const blog = await blogRepo.findOne({ where: { id: blogid } });

  if (!blog || blog.publishStatus !== "published" || blog.isActive === false) {
    res.status(404).json({
      message: "no blog with this id",
    });
    return;
  }

  const userService = process.env.USER_SERVICE?.trim();
  let author: unknown = null;

  if (!userService) {
    console.warn("USER_SERVICE is not configured. Returning blog without author details.");
  } else if (!blog.author) {
    console.warn(`Blog ${blogid} has no author id. Returning blog without author details.`);
  } else {
    try {
      const { data } = await axios.get(`${userService}/api/v1/user/${blog.author}`, {
        timeout: 5000,
      });
      author = data;
    } catch (error: any) {
      const status = error?.response?.status;
      const msg = error?.message || "Failed to fetch author profile";
      console.warn(
        `Author lookup failed for blog ${blogid} (author=${blog.author})`,
        { status, message: msg }
      );
    }
  }

  const responseData = { blog, author };
  await redisClient.set(cacheKey, JSON.stringify(responseData), { EX: 3600 });

  const viewerIdentity = resolveIdentityForRequest(blog.author);
  if (viewerIdentity) {
    await registerUniqueView(blogid, viewerIdentity);
  }
  const blogWithRealtimeCounter = await applyRealtimeCountersToBlog({ ...blog });

  res.json({
    ...responseData,
    blog: blogWithRealtimeCounter,
  });
});

export const getBlogMeta = TryCatch(async (req, res) => {
  const blogid = Number(req.params.id);

  if (!Number.isFinite(blogid)) {
    res.status(400).json({
      message: "Invalid blog id",
    });
    return;
  }

  const blogRepo = AppDataSource.getRepository(Blog);
  const blog = await blogRepo.findOne({
    where: { id: blogid },
    select: {
      id: true,
      author: true,
      title: true,
      publishStatus: true,
      isActive: true,
    },
  });

  if (!blog) {
    res.status(404).json({
      message: "no blog with this id",
    });
    return;
  }

  res.json({
    id: blog.id,
    author: blog.author,
    title: blog.title,
    publishStatus: blog.publishStatus,
    isActive: blog.isActive,
  });
});

export const saveBlog = TryCatch(async (req: AuthenticatedRequest, res) => {
  const blogid = Number(req.params.blogid);
  const userid = req.user?._id;

  if (!Number.isFinite(blogid) || !userid) {
    res.status(400).json({
      message: "Missing blog id or userid",
    });
    return;
  }

  const blogRepo = AppDataSource.getRepository(Blog);
  const blog = await blogRepo.findOne({ where: { id: blogid } });

  if (!blog || blog.publishStatus !== "published" || blog.isActive === false) {
    res.status(404).json({
      message: "No blog with this id",
    });
    return;
  }

  const savedBlogRepo = AppDataSource.getRepository(SavedBlog);
  const existing = await savedBlogRepo.findOne({
    where: { userid, blogid },
  });

  if (!existing) {
    await savedBlogRepo.save(
      savedBlogRepo.create({
        blogid,
        userid,
      })
    );

    res.json({
      message: "Blog Saved",
    });
    return;
  } else {
    await savedBlogRepo.delete({ blogid, userid });

    res.json({
      message: "Blog Unsaved",
    });
    return;
  }
});

export const getSavedBlog = TryCatch(async (req: AuthenticatedRequest, res) => {
  const userid = req.user?._id;

  if (!userid) {
    res.status(401).json({
      message: "Unauthorized",
    });
    return;
  }

  const savedBlogRepo = AppDataSource.getRepository(SavedBlog);
  const blogs = await savedBlogRepo.find({
    where: { userid },
  });

  res.json(blogs);
});

export const getSavedBlogsPaginated = TryCatch(
  async (req: AuthenticatedRequest, res) => {
    const userid = req.user?._id;

    if (!userid) {
      res.status(401).json({
        message: "Unauthorized",
      });
      return;
    }

    const page = parsePositiveInt(req.query.page, 1);
    const requestedLimit = parsePositiveInt(req.query.limit, 10);
    const limit = Math.min(requestedLimit, 30);

    const savedBlogRepo = AppDataSource.getRepository(SavedBlog);
    const [savedEntries, total] = await Promise.all([
      savedBlogRepo.find({
        where: { userid },
        order: { blogid: "DESC" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      savedBlogRepo.count({
        where: { userid },
      }),
    ]);

    if (savedEntries.length === 0) {
      res.json({
        items: [],
        page,
        limit,
        total,
        hasMore: page * limit < total,
      });
      return;
    }

    const ids = savedEntries.map((entry) => Number(entry.blogid));
    const blogRepo = AppDataSource.getRepository(Blog);
    const blogs = await blogRepo.find({
      where: {
        id: In(ids),
        publishStatus: "published",
        isActive: true,
      },
    });

    await applyRealtimeCountersToBlogs(blogs);

    const byId = new Map(blogs.map((blog) => [Number(blog.id), blog]));
    const ordered = ids
      .map((id) => byId.get(id))
      .filter((blog): blog is Blog => Boolean(blog));

    res.json({
      items: ordered,
      page,
      limit,
      total,
      hasMore: page * limit < total,
    });
  }
);

export const getUserBlogs = TryCatch(async (req: AuthenticatedRequest, res) => {
  const authorId = req.params.userid;
  const requesterId = req.user?._id;
  const isAdmin = req.user?.role === "admin";
  const requestedPublishStatus =
    typeof req.query.publishStatus === "string" ? req.query.publishStatus.trim() : "";
  const publishStatusFilter =
    requestedPublishStatus === "draft" || requestedPublishStatus === "published"
      ? requestedPublishStatus
      : null;

  if (!authorId) {
    res.status(400).json({
      message: "Missing user id",
    });
    return;
  }

  const page = parsePositiveInt(req.query.page, 1);
  const requestedLimit = parsePositiveInt(req.query.limit, 20);
  const limit = Math.min(requestedLimit, 100);

  const includeUnpublished = isAdmin || String(authorId) === String(requesterId);
  const blogRepo = AppDataSource.getRepository(Blog);
  const qb = blogRepo.createQueryBuilder("blog");
  qb.where("blog.author = :authorId", { authorId });

  if (publishStatusFilter && includeUnpublished) {
    qb.andWhere("blog.publishStatus = :publishStatus", {
      publishStatus: publishStatusFilter,
    });
  }

  if (!includeUnpublished || publishStatusFilter === "published") {
    qb.andWhere("blog.publishStatus = :publishStatus", {
      publishStatus: "published",
    });
  }

  if (!includeUnpublished) {
    qb.andWhere("blog.isActive = :isActive", { isActive: true });
  }

  const authorTotalsQuery = blogRepo
    .createQueryBuilder("blog")
    .where("blog.author = :authorId", { authorId });

  if (!includeUnpublished) {
    authorTotalsQuery.andWhere("blog.publishStatus = :publishedStatus", {
      publishedStatus: "published",
    });
    authorTotalsQuery.andWhere("blog.isActive = :isActive", {
      isActive: true,
    });
  }

  const [itemsResult, authorTotalBlogs, publishedBlogs, draftBlogs, totalsRaw] =
    await Promise.all([
      qb
        .orderBy("blog.createAt", "DESC")
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount(),
      authorTotalsQuery.getCount(),
      includeUnpublished
        ? blogRepo.count({
            where: {
              author: authorId,
              publishStatus: "published",
            },
          })
        : authorTotalsQuery.getCount(),
      includeUnpublished
        ? blogRepo.count({
            where: {
              author: authorId,
              publishStatus: "draft",
            },
          })
        : Promise.resolve(0),
      authorTotalsQuery
        .select("COALESCE(SUM(blog.likesCount), 0)", "totalLikes")
        .addSelect("COALESCE(SUM(blog.viewsCount), 0)", "totalViews")
        .getRawOne<{ totalLikes?: string | number; totalViews?: string | number }>(),
    ]);

  const [items, total] = itemsResult;

  await applyRealtimeCountersToBlogs(items);

  const realtimeTotalsDelta = await sumRealtimeCountersForAuthor(
    blogRepo,
    authorId,
    includeUnpublished
  );

  res.json({
    items,
    page,
    limit,
    total,
    hasMore: page * limit < total,
    authorTotals: {
      totalBlogs: authorTotalBlogs,
      publishedBlogs,
      draftBlogs,
      totalLikes: Math.max(
        0,
        Number(totalsRaw?.totalLikes ?? 0) + realtimeTotalsDelta.likesDelta
      ),
      totalViews: Math.max(
        0,
        Number(totalsRaw?.totalViews ?? 0) + realtimeTotalsDelta.viewsDelta
      ),
    },
  });
});

export const getPublicUserBlogs = TryCatch(async (req, res) => {
  const authorId = req.params.userid;

  if (!authorId) {
    res.status(400).json({
      message: "Missing user id",
    });
    return;
  }

  const page = parsePositiveInt(req.query.page, 1);
  const requestedLimit = parsePositiveInt(req.query.limit, 12);
  const limit = Math.min(requestedLimit, 50);

  const blogRepo = AppDataSource.getRepository(Blog);
  const qb = blogRepo
    .createQueryBuilder("blog")
    .where("blog.author = :authorId", { authorId })
    .andWhere("blog.publishStatus = :publishStatus", {
      publishStatus: "published",
    })
    .andWhere("blog.isActive = :isActive", { isActive: true });

  const [items, total] = await qb
    .orderBy("blog.createAt", "DESC")
    .skip((page - 1) * limit)
    .take(limit)
    .getManyAndCount();

  await applyRealtimeCountersToBlogs(items);

  const totalsRaw = await blogRepo
    .createQueryBuilder("blog")
    .select("COUNT(*)", "totalBlogs")
    .addSelect("COALESCE(SUM(blog.likesCount), 0)", "totalLikes")
    .addSelect("COALESCE(SUM(blog.viewsCount), 0)", "totalViews")
    .where("blog.author = :authorId", { authorId })
    .andWhere("blog.publishStatus = :publishStatus", {
      publishStatus: "published",
    })
    .andWhere("blog.isActive = :isActive", { isActive: true })
    .getRawOne<{
      totalBlogs?: string | number;
      totalLikes?: string | number;
      totalViews?: string | number;
    }>();

  const realtimeTotalsDelta = await sumRealtimeCountersForAuthor(
    blogRepo,
    authorId,
    false
  );

  res.json({
    items,
    page,
    limit,
    total,
    hasMore: page * limit < total,
    authorTotals: {
      totalBlogs: Number(totalsRaw?.totalBlogs ?? total),
      totalLikes: Math.max(
        0,
        Number(totalsRaw?.totalLikes ?? 0) + realtimeTotalsDelta.likesDelta
      ),
      totalViews: Math.max(
        0,
        Number(totalsRaw?.totalViews ?? 0) + realtimeTotalsDelta.viewsDelta
      ),
    },
  });
});

export const getPublicUserBlogStats = TryCatch(async (req, res) => {
  const authorId = req.params.userid;

  if (!authorId) {
    res.status(400).json({
      message: "Missing user id",
    });
    return;
  }

  const blogRepo = AppDataSource.getRepository(Blog);
  const totals = await blogRepo
    .createQueryBuilder("blog")
    .select("COUNT(*)", "totalBlogs")
    .addSelect("COALESCE(SUM(blog.likesCount), 0)", "totalLikes")
    .addSelect("COALESCE(SUM(blog.viewsCount), 0)", "totalViews")
    .where("blog.author = :authorId", { authorId })
    .andWhere("blog.publishStatus = :publishStatus", { publishStatus: "published" })
    .andWhere("blog.isActive = :isActive", { isActive: true })
    .getRawOne<{ totalBlogs?: string | number; totalLikes?: string | number; totalViews?: string | number }>();

  const realtimeTotalsDelta = await sumRealtimeCountersForAuthor(
    blogRepo,
    authorId,
    false
  );

  res.json({
    totalBlogs: Number(totals?.totalBlogs ?? 0),
    totalLikes: Math.max(
      0,
      Number(totals?.totalLikes ?? 0) + realtimeTotalsDelta.likesDelta
    ),
    totalViews: Math.max(
      0,
      Number(totals?.totalViews ?? 0) + realtimeTotalsDelta.viewsDelta
    ),
  });
});

export const getSingleBlogInsights = TryCatch(
  async (req: AuthenticatedRequest, res) => {
    const blogid = Number(req.params.id);
    const requesterId = req.user?._id;
    const isAdmin = req.user?.role === "admin";
    const granularity = parseInsightGranularity(req.query.granularity);
    const { start, end } = resolveInsightsRange(req.query, granularity);

    if (!Number.isFinite(blogid)) {
      res.status(400).json({
        message: "Invalid blog id",
      });
      return;
    }

    const blogRepo = AppDataSource.getRepository(Blog);
    const blog = await blogRepo.findOne({ where: { id: blogid } });

    if (!blog) {
      res.status(404).json({
        message: "No blog with this id",
      });
      return;
    }

    if (!isAdmin && String(blog.author) !== String(requesterId)) {
      res.status(403).json({
        message: "Not allowed to view this blog insight",
      });
      return;
    }

    const cacheKey = `blog:insights:${blogid}:${granularity}:${start.toISOString().slice(0, 10)}:${end.toISOString().slice(0, 10)}`;
    const cached = await safeGetCache(cacheKey);
    if (cached) {
      res.json(JSON.parse(cached));
      return;
    }

    const bucketExpr = buildBucketSelect("day", granularity);
    const rows = await AppDataSource.query(
      `
        SELECT ${bucketExpr} AS bucket, SUM(views_count)::int AS count
        FROM blog_view_stats
        WHERE blog_id = $1
          AND day >= $2::date
          AND day < $3::date
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
      [blogid, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
    );

    const seriesMap = new Map<string, number>();
    for (const item of rows as { bucket: string; count?: number }[]) {
      const key = toIsoBucket(item.bucket);
      seriesMap.set(key, (seriesMap.get(key) ?? 0) + Number(item.count ?? 0));
    }

    if (redisClient.isOpen) {
      const dayKeys = buildDayList(start, end);
      if (dayKeys.length > 0) {
        const redisKeys = dayKeys.map((day) => `blog:${blogid}:views:daily:${day}`);
        const redisValues = await redisClient.mGet(redisKeys);

        dayKeys.forEach((day, index) => {
          const raw = redisValues[index];
          const delta = Number(raw ?? 0);
          if (!Number.isFinite(delta) || delta <= 0) {
            return;
          }

          const bucketKey = bucketForGranularity(day, granularity);
          seriesMap.set(bucketKey, (seriesMap.get(bucketKey) ?? 0) + delta);
        });
      }
    }

    const series = Array.from(seriesMap.entries())
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .map(([bucket, count]) => ({ bucket, count }));

    const totalViews = series.reduce((sum, item) => sum + Number(item.count ?? 0), 0);

    const payload = {
      blogId: blogid,
      granularity,
      range: {
        start,
        end,
      },
      series,
      totals: {
        views: totalViews,
      },
    };

    await safeSetCache(cacheKey, payload, 60);

    res.json(payload);
  }
);

export const toggleBlogLike = TryCatch(async (req: AuthenticatedRequest, res) => {
  const blogid = Number(req.params.id);
  const userid = req.user?._id;

  if (!Number.isFinite(blogid) || !userid) {
    res.status(400).json({
      message: "Missing blog id or userid",
    });
    return;
  }

  const blogRepo = AppDataSource.getRepository(Blog);
  const blog = await blogRepo.findOne({ where: { id: blogid } });

  if (!blog || blog.publishStatus !== "published" || blog.isActive === false) {
    res.status(404).json({
      message: "No blog with this id",
    });
    return;
  }

  try {
    const { liked } = await toggleLike(blogid, userid);

    if (liked && String(blog.author) !== String(userid)) {
      void publishNotificationEvent({
        type: "blog_like",
        recipientUserId: String(blog.author),
        actorUserId: String(userid),
        actorName: req.user?.name || "Someone",
        blogId: blogid,
        createdAt: new Date().toISOString(),
      });
    }

    const delta = await getCounterDelta(blogid);

    res.json({
      message: liked ? "Blog liked" : "Blog unliked",
      liked,
      likesCount: Math.max(0, (blog.likesCount ?? 0) + delta.likesDelta),
      viewsCount: Math.max(0, (blog.viewsCount ?? 0) + delta.viewsDelta),
    });
    return;
  } catch (error) {
    if (!isRedisUnavailableError(error)) {
      throw error;
    }

    const fallback = await toggleLikeWithDbFallback(blogid, userid);

    if (fallback.liked && String(blog.author) !== String(userid)) {
      void publishNotificationEvent({
        type: "blog_like",
        recipientUserId: String(blog.author),
        actorUserId: String(userid),
        actorName: req.user?.name || "Someone",
        blogId: blogid,
        createdAt: new Date().toISOString(),
      });
    }

    res.json({
      message: fallback.liked ? "Blog liked" : "Blog unliked",
      liked: fallback.liked,
      likesCount: fallback.likesCount,
      viewsCount: fallback.viewsCount,
      mode: "db-fallback",
    });
  }
});

export const getBlogLikeStatus = TryCatch(
  async (req: AuthenticatedRequest, res) => {
    const blogid = Number(req.params.id);
    const userid = req.user?._id;

    if (!Number.isFinite(blogid) || !userid) {
      res.status(400).json({
        message: "Missing blog id or userid",
      });
      return;
    }

    const blogRepo = AppDataSource.getRepository(Blog);
    const blog = await blogRepo.findOne({ where: { id: blogid } });

    if (!blog || blog.publishStatus !== "published" || blog.isActive === false) {
      res.status(404).json({
        message: "No blog with this id",
      });
      return;
    }

    let liked: boolean;
    try {
      liked = Boolean(await isLikedByUser(blogid, userid));
    } catch (error) {
      if (!isRedisUnavailableError(error)) {
        throw error;
      }

      const blogLikeRepo = AppDataSource.getRepository(BlogLike);
      const like = await blogLikeRepo.findOne({
        where: {
          blogId: blogid,
          userId: userid,
        },
      });
      liked = Boolean(like);
    }

    const delta = await getCounterDelta(blogid);

    res.json({
      liked,
      likesCount: Math.max(0, (blog.likesCount ?? 0) + delta.likesDelta),
      viewsCount: Math.max(0, (blog.viewsCount ?? 0) + delta.viewsDelta),
    });
  }
);

export const reportBlog = TryCatch(async (req: AuthenticatedRequest, res) => {
  const blogid = Number(req.params.id);
  const userid = req.user?._id;
  const reason =
    typeof req.body.reason === "string" && req.body.reason.trim()
      ? req.body.reason.trim()
      : "other";
  const details =
    typeof req.body.details === "string" && req.body.details.trim()
      ? req.body.details.trim()
      : undefined;

  if (!Number.isFinite(blogid) || !userid) {
    res.status(400).json({
      message: "Missing blog id or userid",
    });
    return;
  }

  const blogRepo = AppDataSource.getRepository(Blog);
  const blog = await blogRepo.findOne({ where: { id: blogid } });

  if (!blog) {
    res.status(404).json({
      message: "No blog with this id",
    });
    return;
  }

  const reportRepo = AppDataSource.getRepository(BlogReport);
  const existingOpen = await reportRepo.findOne({
    where: {
      blogId: blogid,
      reportedBy: userid,
      status: "open",
    },
  });

  if (existingOpen) {
    res.status(400).json({
      message: "You already reported this blog",
    });
    return;
  }

  const report = await reportRepo.save(
    reportRepo.create({
      blogId: blogid,
      reportedBy: userid,
      reason: reason.toLowerCase(),
      details,
      status: "open",
    })
  );

  res.json({
    message: "Report submitted",
    report,
  });
});

export const getAdminBlogs = TryCatch(async (req, res) => {
  const searchQuery =
    typeof req.query.searchQuery === "string" ? req.query.searchQuery.trim() : "";
  const category =
    typeof req.query.category === "string" ? req.query.category.trim() : "";
  const publishStatus =
    typeof req.query.publishStatus === "string"
      ? req.query.publishStatus.trim()
      : "";
  const activity =
    typeof req.query.activity === "string" ? req.query.activity.trim() : "";

  const page = parsePositiveInt(req.query.page, 1);
  const requestedLimit = parsePositiveInt(req.query.limit, 20);
  const limit = Math.min(requestedLimit, 100);

  const blogRepo = AppDataSource.getRepository(Blog);
  const qb = blogRepo.createQueryBuilder("blog");

  if (searchQuery) {
    qb.andWhere("(blog.title ILIKE :q OR blog.description ILIKE :q)", {
      q: `%${searchQuery}%`,
    });
  }

  if (category) {
    qb.andWhere("blog.category = :category", { category });
  }

  if (publishStatus === "draft" || publishStatus === "published") {
    qb.andWhere("blog.publishStatus = :publishStatus", { publishStatus });
  }

  if (activity === "active") {
    qb.andWhere("blog.isActive = :isActive", { isActive: true });
  } else if (activity === "inactive") {
    qb.andWhere("blog.isActive = :isActive", { isActive: false });
  }

  const [items, total] = await qb
    .orderBy("blog.createAt", "DESC")
    .skip((page - 1) * limit)
    .take(limit)
    .getManyAndCount();

  await applyRealtimeCountersToBlogs(items);

  res.json({
    items,
    page,
    limit,
    total,
    hasMore: page * limit < total,
  });
});

export const getAdminReports = TryCatch(async (req, res) => {
  const page = parsePositiveInt(req.query.page, 1);
  const requestedLimit = parsePositiveInt(req.query.limit, 20);
  const limit = Math.min(requestedLimit, 100);
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";

  const reportRepo = AppDataSource.getRepository(BlogReport);
  const qb = reportRepo.createQueryBuilder("report");

  if (status === "open" || status === "resolved" || status === "dismissed") {
    qb.andWhere("report.status = :status", { status });
  }

  qb.leftJoin(Blog, "blog", "blog.id = report.blogId");
  qb.select([
    "report.id AS id",
    "report.blogId AS blogId",
    "report.reportedBy AS reportedBy",
    "report.reason AS reason",
    "report.details AS details",
    "report.status AS status",
    "report.createdAt AS createdAt",
    "report.updatedAt AS updatedAt",
    "blog.title AS blogTitle",
    "blog.author AS blogAuthor",
    "blog.publishStatus AS blogPublishStatus",
    "blog.isActive AS blogIsActive",
  ]);

  const totalQb = qb.clone();
  const [rows, total] = await Promise.all([
    qb.orderBy("report.createdAt", "DESC")
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany(),
    totalQb.getCount(),
  ]);

  res.json({
    items: rows,
    page,
    limit,
    total,
    hasMore: page * limit < total,
  });
});

export const updateAdminReportStatus = TryCatch(async (req, res) => {
  const reportId = Number(req.params.id);
  const status = typeof req.body.status === "string" ? req.body.status.trim() : "";

  if (!Number.isFinite(reportId)) {
    res.status(400).json({
      message: "Invalid report id",
    });
    return;
  }

  if (status !== "open" && status !== "resolved" && status !== "dismissed") {
    res.status(400).json({
      message: "Invalid report status",
    });
    return;
  }

  const reportRepo = AppDataSource.getRepository(BlogReport);
  const report = await reportRepo.findOne({ where: { id: reportId } });

  if (!report) {
    res.status(404).json({
      message: "No report with this id",
    });
    return;
  }

  report.status = status;
  const updated = await reportRepo.save(report);

  res.json({
    message: "Report updated",
    report: updated,
  });
});

export const getBlogInsights = TryCatch(async (req, res) => {
  const blogRepo = AppDataSource.getRepository(Blog);
  const reportRepo = AppDataSource.getRepository(BlogReport);
  const granularity = parseInsightGranularity(req.query.granularity);
  const { start, end } = resolveInsightsRange(req.query, granularity);
  const bypassCache =
    parseBooleanFlag(req.query.noCache) || parseBooleanFlag(req.query.fresh);
  const cacheKey = `admin:blog:insights:${granularity}:${start.toISOString().slice(0, 10)}:${end.toISOString().slice(0, 10)}`;
  if (!bypassCache) {
    const cached = await safeGetCache(cacheKey);
    if (cached) {
      res.json(JSON.parse(cached));
      return;
    }
  }

  const bucketExprForBlogCreate = buildBucketSelect("blog.create_at", granularity);
  const bucketExprForViewStat = buildBucketSelect("day", granularity);

  const [totalBlogs, weeklyBlogs, monthlyBlogs, yearlyBlogs] = await Promise.all([
    blogRepo.count(),
    blogRepo.count({
      where: { createAt: MoreThanOrEqual(getDateRange("weekly").start) },
    }),
    blogRepo.count({
      where: { createAt: MoreThanOrEqual(getDateRange("monthly").start) },
    }),
    blogRepo.count({
      where: { createAt: MoreThanOrEqual(getDateRange("yearly").start) },
    }),
  ]);

  const blogAdds = await blogRepo
    .createQueryBuilder("blog")
    .select(bucketExprForBlogCreate, "bucket")
    .addSelect("COUNT(*)", "count")
    .where("blog.create_at >= :start", { start })
    .andWhere("blog.create_at < :end", { end })
    .groupBy("bucket")
    .orderBy("bucket", "ASC")
    .getRawMany();

  const blogViews = await AppDataSource.query(
    `
      SELECT ${bucketExprForViewStat} AS bucket, SUM(views_count)::int AS count
      FROM blog_view_stats
      WHERE day >= $1::date
        AND day < $2::date
      GROUP BY bucket
      ORDER BY bucket ASC
    `,
    [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
  );

  const viewsSeriesMap = new Map<string, number>();
  for (const item of blogViews as { bucket: string; count?: number }[]) {
    const key = toIsoBucket(item.bucket);
    viewsSeriesMap.set(key, (viewsSeriesMap.get(key) ?? 0) + Number(item.count ?? 0));
  }

  if (redisClient.isOpen) {
    const startKey = start.toISOString().slice(0, 10);
    const endKey = end.toISOString().slice(0, 10);
    const dirtyTokens = await redisClient.sMembers("blogs:views:daily:dirty");
    const keysToFetch: string[] = [];
    const daysForKey: string[] = [];

    for (const token of dirtyTokens) {
      const [blogRaw, day] = token.split("|");
      if (!day) {
        continue;
      }

      if (day < startKey || day >= endKey) {
        continue;
      }

      keysToFetch.push(`blog:${blogRaw}:views:daily:${day}`);
      daysForKey.push(day);
    }

    if (keysToFetch.length > 0) {
      const values = await redisClient.mGet(keysToFetch);
      daysForKey.forEach((day, index) => {
        const raw = values[index];
        const delta = Number(raw ?? 0);
        if (!Number.isFinite(delta) || delta <= 0) {
          return;
        }

        const bucketKey = bucketForGranularity(day, granularity);
        viewsSeriesMap.set(bucketKey, (viewsSeriesMap.get(bucketKey) ?? 0) + delta);
      });
    }
  }

  const mergedBlogViews = Array.from(viewsSeriesMap.entries())
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    .map(([bucket, count]) => ({ bucket, count }));

  const [publishedBlogs, draftBlogs, activeBlogs, inactiveBlogs, openReports] =
    await Promise.all([
      blogRepo.count({ where: { publishStatus: "published" } }),
      blogRepo.count({ where: { publishStatus: "draft" } }),
      blogRepo.count({ where: { isActive: true } }),
      blogRepo.count({ where: { isActive: false } }),
      reportRepo.count({ where: { status: "open" } }),
    ]);

  const payload = {
    totals: {
      blogs: totalBlogs,
      publishedBlogs,
      draftBlogs,
      activeBlogs,
      inactiveBlogs,
      openReports,
    },
    periods: {
      weekly: weeklyBlogs,
      monthly: monthlyBlogs,
      yearly: yearlyBlogs,
    },
    series: {
      granularity,
      range: {
        start,
        end,
      },
      blogAdds: blogAdds.map((item) => ({
        bucket: item.bucket,
        count: Number(item.count ?? 0),
      })),
      blogViews: blogViews.map((item: { bucket: string; count?: number }) => ({
        bucket: item.bucket,
        count: Number(item.count ?? 0),
      })),
    },
  };

  payload.series.blogViews = mergedBlogViews;

  if (!bypassCache) {
    await safeSetCache(cacheKey, payload, 15);
  }

  res.json(payload);
});
