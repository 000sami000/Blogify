import express from "express";
import {
  getAdminUsers,
  getUserInsights,
  getUserProfile,
  loginWithEmail,
  loginUser,
  myProfile,
  registerWithEmail,
  setUserActiveStatus,
  setUserBanStatus,
  toggleProfileStar,
  updateProfileBanner,
  updateProfilePic,
  updateUser,
} from "../controllers/user.js";
import { isAuth } from "../middleware/isAuth.js";
import { isAdmin } from "../middleware/isAdmin.js";
import uploadFile from "../middleware/multer.js";

const router = express.Router();
/**
 * @openapi
 * /api/v1/users:
 *   get:
 *     summary: List users
 *     tags:
 *       - Users
 *     responses:
 *       200:
 *         description: OK
 */
router.post("/login", loginUser);
router.post("/auth/register", registerWithEmail);
router.post("/auth/login", loginWithEmail);
router.get("/me", isAuth, myProfile);
router.get("/user/:id", getUserProfile);
router.post("/user/:id/star", isAuth, toggleProfileStar);
router.post("/user/update", isAuth, updateUser);
router.post("/user/update/pic", isAuth, uploadFile, updateProfilePic);
router.post("/user/update/banner", isAuth, uploadFile, updateProfileBanner);
router.get("/admin/users", isAuth, isAdmin, getAdminUsers);
router.get("/admin/insights", isAuth, isAdmin, getUserInsights);
router.patch("/admin/user/:id/ban", isAuth, isAdmin, setUserBanStatus);
router.patch("/admin/user/:id/active", isAuth, isAdmin, setUserActiveStatus);

export default router;
