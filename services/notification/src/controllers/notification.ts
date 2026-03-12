import mongoose from "mongoose";
import { AuthenticatedRequest } from "../middleware/isAuth.js";
import Notification from "../model/Notification.js";
import TryCatch from "../utils/TryCatch.js";

const parsePositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

interface NotificationRecord {
  _id: mongoose.Types.ObjectId | string;
  recipientUserId: string;
  actorUserId: string;
  actorName?: string;
  type: "blog_like" | "blog_comment" | "profile_star";
  blogId?: number;
  commentId?: string;
  message: string;
  isRead: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const serializeNotification = (entry: NotificationRecord) => ({
  id: String(entry._id),
  recipientUserId: entry.recipientUserId,
  actorUserId: entry.actorUserId,
  actorName: entry.actorName,
  type: entry.type,
  blogId: entry.blogId,
  commentId: entry.commentId,
  message: entry.message,
  isRead: Boolean(entry.isRead),
  metadata: entry.metadata || {},
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
});

export const getMyNotifications = TryCatch(
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({
        message: "Unauthorized",
      });
      return;
    }

    const page = parsePositiveInt(req.query.page, 1);
    const requestedLimit = parsePositiveInt(req.query.limit, 20);
    const limit = Math.min(requestedLimit, 50);
    const onlyUnread =
      req.query.onlyUnread === "1" || req.query.onlyUnread === "true";

    const filter: Record<string, unknown> = {
      recipientUserId: String(userId),
    };

    if (onlyUnread) {
      filter.isRead = false;
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<NotificationRecord[]>(),
      Notification.countDocuments(filter),
    ]);

    res.json({
      items: items.map((item) => serializeNotification(item)),
      page,
      limit,
      total,
      hasMore: page * limit < total,
    });
  }
);

export const getUnreadCount = TryCatch(
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({
        message: "Unauthorized",
      });
      return;
    }

    const count = await Notification.countDocuments({
      recipientUserId: String(userId),
      isRead: false,
    });

    res.json({
      unreadCount: count,
    });
  }
);

export const markNotificationAsRead = TryCatch(
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user?._id;
    const notificationId = String(req.params.id ?? "");

    if (!userId) {
      res.status(401).json({
        message: "Unauthorized",
      });
      return;
    }

    if (!mongoose.isValidObjectId(notificationId)) {
      res.status(400).json({
        message: "Invalid notification id",
      });
      return;
    }

    const updated = await Notification.findOneAndUpdate(
      {
        _id: notificationId,
        recipientUserId: String(userId),
      },
      {
        isRead: true,
      },
      { new: true }
    );

    if (!updated) {
      res.status(404).json({
        message: "No notification with this id",
      });
      return;
    }

    res.json({
      message: "Notification marked as read",
      notification: serializeNotification(updated),
    });
  }
);

export const markAllAsRead = TryCatch(async (req: AuthenticatedRequest, res) => {
  const userId = req.user?._id;

  if (!userId) {
    res.status(401).json({
      message: "Unauthorized",
    });
    return;
  }

  const result = await Notification.updateMany(
    {
      recipientUserId: String(userId),
      isRead: false,
    },
    {
      $set: {
        isRead: true,
      },
    }
  );

  res.json({
    message: "Notifications marked as read",
    modifiedCount: result.modifiedCount ?? 0,
  });
});

export const deleteNotification = TryCatch(async (req: AuthenticatedRequest, res) => {
  const userId = req.user?._id;
  const notificationId = String(req.params.id ?? "");

  if (!userId) {
    res.status(401).json({
      message: "Unauthorized",
    });
    return;
  }

  if (!mongoose.isValidObjectId(notificationId)) {
    res.status(400).json({
      message: "Invalid notification id",
    });
    return;
  }

  const deleted = await Notification.findOneAndDelete({
    _id: notificationId,
    recipientUserId: String(userId),
  });

  if (!deleted) {
    res.status(404).json({
      message: "No notification with this id",
    });
    return;
  }

  res.json({
    message: "Notification deleted",
  });
});

export const deleteAllNotifications = TryCatch(async (req: AuthenticatedRequest, res) => {
  const userId = req.user?._id;

  if (!userId) {
    res.status(401).json({
      message: "Unauthorized",
    });
    return;
  }

  const result = await Notification.deleteMany({
    recipientUserId: String(userId),
  });

  res.json({
    message: "Notifications cleared",
    deletedCount: result.deletedCount ?? 0,
  });
});
