import { Blog } from "@/context/AppContext";

export const BLOG_PAGE_SIZE = 8;

export type BlogListKind = "published" | "draft";

export interface BlogInsightsResponse {
  series?: Array<{ bucket: string; count: number }>;
  totals?: { views?: number };
}

export interface SelectedBlogStats {
  likesCount: number;
  commentsCount: number;
  isActive: boolean;
}

export interface AuthorTotals {
  totalBlogs: number;
  publishedBlogs: number;
  draftBlogs: number;
  totalLikes: number;
  totalViews: number;
}

export interface UserBlogsResponse {
  items?: Blog[];
  page?: number;
  limit?: number;
  total?: number;
  hasMore?: boolean;
  authorTotals?: Partial<AuthorTotals>;
}

export interface BlogListState {
  items: Blog[];
  page: number;
  total: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  initialized: boolean;
}

export const createInitialBlogListState = (): BlogListState => ({
  items: [],
  page: 1,
  total: 0,
  hasMore: false,
  loading: false,
  loadingMore: false,
  initialized: false,
});

export const initialAuthorTotals: AuthorTotals = {
  totalBlogs: 0,
  publishedBlogs: 0,
  draftBlogs: 0,
  totalLikes: 0,
  totalViews: 0,
};
