import mongoose, { Document, Schema } from "mongoose";

export interface IProfileStar extends Document {
  targetUserId: string;
  viewerUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

const profileStarSchema: Schema<IProfileStar> = new Schema(
  {
    targetUserId: {
      type: String,
      required: true,
      index: true,
    },
    viewerUserId: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

profileStarSchema.index(
  { targetUserId: 1, viewerUserId: 1 },
  { unique: true, name: "unique_profile_star" }
);

const ProfileStar = mongoose.model<IProfileStar>("ProfileStar", profileStarSchema);

export default ProfileStar;

