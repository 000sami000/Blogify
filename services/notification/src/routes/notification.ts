import express from "express";
import {
  deleteAllNotifications,
  deleteNotification,
  getMyNotifications,
  getUnreadCount,
  markAllAsRead,
  markNotificationAsRead,
} from "../controllers/notification.js";
import { isAuth } from "../middleware/isAuth.js";

const router = express.Router();

router.get("/notification/my", isAuth, getMyNotifications);
router.get("/notification/unread-count", isAuth, getUnreadCount);
router.patch("/notification/:id/read", isAuth, markNotificationAsRead);
router.patch("/notification/read-all", isAuth, markAllAsRead);
router.delete("/notification/delete-all", isAuth, deleteAllNotifications);
router.delete("/notification/:id", isAuth, deleteNotification);

export default router;
