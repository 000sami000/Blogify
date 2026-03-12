import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  image: string;
  banner?: string;
  instagram: string;
  facebook: string;
  linkedin: string;
  bio: string;
  authProvider: "google" | "local";
  passwordHash?: string;
  role: "user" | "admin";
  isBanned: boolean;
  isActive: boolean;
  profileVisits: number;
  starsCount: number;
}

const schema: Schema<IUser> = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    image: {
      type: String,
      required: true,
    },
    banner: String,
    instagram: String,
    facebook: String,
    linkedin: String,
    bio: String,
    authProvider: {
      type: String,
      enum: ["google", "local"],
      default: "google",
      index: true,
    },
    passwordHash: {
      type: String,
      select: false,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      index: true,
    },
    isBanned: {
      type: Boolean,
      default: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    profileVisits: {
      type: Number,
      default: 0,
      min: 0,
    },
    starsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model<IUser>("User", schema);

export default User;
