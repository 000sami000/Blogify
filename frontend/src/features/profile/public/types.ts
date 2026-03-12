import { Blog, User } from "@/context/AppContext";

export interface PublicProfileUser extends User {
  starsCount?: number;
  viewerStarred?: boolean;
}

export interface PublicBlogStats {
  totalBlogs: number;
  totalLikes: number;
  totalViews: number;
}

export interface PublicProfileBlogsResponse {
  items: Blog[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export const defaultPublicBlogStats: PublicBlogStats = {
  totalBlogs: 0,
  totalLikes: 0,
  totalViews: 0,
};

export const defaultPublicBlogsResponse: PublicProfileBlogsResponse = {
  items: [],
  page: 1,
  limit: 6,
  total: 0,
  hasMore: false,
};
