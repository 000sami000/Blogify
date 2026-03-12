import express from "express";
import {
  addComment,
  deleteComment,
  getAllComments,
  updateComment,
} from "../controllers/comment.js";
import { isAuth } from "../middlewares/isAuth.js";

const router = express.Router();

router.post("/comment/:id", isAuth, addComment);
router.get("/comment/:id", getAllComments);
router.put("/comment/:commentid", isAuth, updateComment);
router.delete("/comment/:commentid", isAuth, deleteComment);

export default router;
