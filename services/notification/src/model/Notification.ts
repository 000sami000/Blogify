import { Document, model, Schema } from "mongoose";

export type NotificationType = "blog_like" | "blog_comment" | "profile_star";

export interface INotification extends Document {
  recipientUserId: string;
  actorUserId: string;
  actorName?: string;
  type: NotificationType;
  blogId?: number;
  commentId?: string;
  message: string;
  isRead: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipientUserId: {
      type: String,
      required: true,
      index: true,
    },
    actorUserId: {
      type: String,
      required: true,
      index: true,
    },
    actorName: {
      type: String,
      default: "",
    },
    type: {
      type: String,
      enum: ["blog_like", "blog_comment", "profile_star"],
      required: true,
      index: true,
    },
    blogId: {
      type: Number,
      index: true,
    },
    commentId: {
      type: String,
      default: "",
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ recipientUserId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipientUserId: 1, createdAt: -1 });

const Notification = model<INotification>("Notification", notificationSchema);

export default Notification;
