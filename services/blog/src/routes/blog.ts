import express from "express";
import {
  getAdminBlogs,
  getAdminReports,
  getBlogInsights,
  getBlogLikeStatus,
  getBlogMeta,
  getAllBlogs,
  getSavedBlogsPaginated,
  getSingleBlogInsights,
  getSavedBlog,
  getSingleBlog,
  getUserBlogs,
  getPublicUserBlogs,
  getPublicUserBlogStats,
  reportBlog,
  saveBlog,
  toggleBlogLike,
  updateAdminReportStatus,
} from "../controllers/blog.js";
import { isAuth } from "../middleware/isAuth.js";
import { isAdmin } from "../middleware/isAdmin.js";

const router = express.Router();

router.get("/blog/all", getAllBlogs);
router.get("/blog/saved/all", isAuth, getSavedBlog);
router.get("/blog/saved", isAuth, getSavedBlogsPaginated);
router.get("/blog/:id", getSingleBlog);
router.get("/blog/:id/meta", getBlogMeta);
router.get("/blog/:id/insights", isAuth, getSingleBlogInsights);
router.get("/blog/user/:userid/stats", getPublicUserBlogStats);
router.get("/blog/user/:userid/public", getPublicUserBlogs);
router.get("/blog/user/:userid", isAuth, getUserBlogs);
router.post("/blog/:id/like", isAuth, toggleBlogLike);
router.get("/blog/:id/like/status", isAuth, getBlogLikeStatus);
router.post("/blog/:id/report", isAuth, reportBlog);
router.post("/save/:blogid", isAuth, saveBlog);
router.get("/admin/blogs", isAuth, isAdmin, getAdminBlogs);
router.get("/admin/reports", isAuth, isAdmin, getAdminReports);
router.patch("/admin/reports/:id", isAuth, isAdmin, updateAdminReportStatus);
router.get("/admin/insights", isAuth, isAdmin, getBlogInsights);

export default router;
