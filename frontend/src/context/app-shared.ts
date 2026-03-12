export const user_service = process.env.NEXT_PUBLIC_USER_SERVICE!;
export const author_service = process.env.NEXT_PUBLIC_AUTHOR_SERVICE!;
export const blog_service = process.env.NEXT_PUBLIC_BLOG_SERVICE!;
export const comments_service = process.env.NEXT_PUBLIC_COMMENTS_SERVICE!;
export const notification_service = process.env.NEXT_PUBLIC_NOTIFICATION_SERVICE!;
export const google_client_id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;

export const blogCategories = [
  "Techonlogy",
  "Health",
  "Finance",
  "Travel",
  "Education",
  "Entertainment",
  "Study",
];

export interface User {
  _id: string;
  name: string;
  email: string;
  image: string;
  banner?: string;
  instagram: string;
  facebook: string;
  linkedin: string;
  bio: string;
  role?: "user" | "admin";
  isBanned?: boolean;
  isActive?: boolean;
  profileVisits?: number;
  starsCount?: number;
  viewerStarred?: boolean;
  createdAt?: string;
}

export interface Blog {
  id: string;
  title: string;
  description: string;
  blogcontent: string | Record<string, unknown>;
  image: string;
  category: string;
  author: string;
  created_at?: string;
  createAt?: string;
  likesCount?: number;
  viewsCount?: number;
  likes_count?: number;
  views_count?: number;
  publishStatus?: "draft" | "published";
  publish_status?: "draft" | "published";
  isActive?: boolean;
  is_active?: boolean;
}

export interface SavedBlogType {
  userid: string;
  blogid: string;
}
