import { Document, model, Schema } from "mongoose";

export interface IComment extends Document {
  comment: string;
  user_id: string;
  username: string;
  blog_id: number;
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema = new Schema<IComment>(
  {
    comment: {
      type: String,
      required: true,
      trim: true,
    },
    user_id: {
      type: String,
      required: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
    },
    blog_id: {
      type: Number,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

commentSchema.index({ blog_id: 1, createdAt: -1 });
commentSchema.index({ blog_id: 1, user_id: 1 });

const Comment = model<IComment>("Comment", commentSchema);

export default Comment;
