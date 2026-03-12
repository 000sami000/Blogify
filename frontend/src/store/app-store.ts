"use client";

import { getApiErrorMessage } from "@/lib/api-error";
import { getAuthToken } from "@/lib/auth-token";
import axios from "axios";
import Cookies from "js-cookie";
import { create } from "zustand";
import toast from "react-hot-toast";
import { blog_service, Blog, SavedBlogType, user_service, User } from "@/context/app-shared";

type SetStateAction<T> = T | ((previous: T) => T);

interface AppDataStore {
  user: User | null;
  loading: boolean;
  isAuth: boolean;
  apiError: string | null;
  blogs: Blog[] | null;
  blogLoading: boolean;
  searchQuery: string;
  category: string;
  savedBlogs: SavedBlogType[] | null;

  setUser: (value: SetStateAction<User | null>) => void;
  setLoading: (value: SetStateAction<boolean>) => void;
  setIsAuth: (value: SetStateAction<boolean>) => void;
  setSearchQuery: (value: SetStateAction<string>) => void;
  setCategory: (value: SetStateAction<string>) => void;
  setApiErrorMessage: (message: string | null) => void;
  clearApiError: () => void;

  fetchUser: () => Promise<void>;
  fetchBlogs: (params?: { searchQuery?: string; category?: string }) => Promise<void>;
  getSavedBlogs: () => Promise<void>;
  logoutUser: () => Promise<void>;
  initializeAppData: () => Promise<void>;
}

const resolveAction = <T>(action: SetStateAction<T>, previous: T): T =>
  typeof action === "function" ? (action as (value: T) => T)(previous) : action;

const normalizeSavedBlogs = (data: unknown): SavedBlogType[] => {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((item) => {
      const saved = item as { userid?: unknown; blogid?: unknown };
      return {
        userid: String(saved?.userid ?? ""),
        blogid: String(saved?.blogid ?? ""),
      };
    })
    .filter((item) => item.userid && item.blogid);
};

export const useAppDataStore = create<AppDataStore>((set, get) => ({
  user: null,
  loading: true,
  isAuth: false,
  apiError: null,
  blogs: null,
  blogLoading: true,
  searchQuery: "",
  category: "",
  savedBlogs: null,

  setUser: (value) => {
    set((state) => ({
      user: resolveAction(value, state.user),
    }));
  },
  setLoading: (value) => {
    set((state) => ({
      loading: resolveAction(value, state.loading),
    }));
  },
  setIsAuth: (value) => {
    const nextValue = resolveAction(value, get().isAuth);
    set({
      isAuth: nextValue,
      savedBlogs: nextValue ? get().savedBlogs : null,
    });

    if (nextValue) {
      void get().getSavedBlogs();
    }
  },
  setSearchQuery: (value) => {
    set((state) => ({
      searchQuery: resolveAction(value, state.searchQuery),
    }));
  },
  setCategory: (value) => {
    set((state) => ({
      category: resolveAction(value, state.category),
    }));
  },
  setApiErrorMessage: (message) => {
    set({
      apiError: message,
    });
  },
  clearApiError: () => {
    set({
      apiError: null,
    });
  },

  fetchUser: async () => {
    try {
      const token = getAuthToken();
      if (!token) {
        set({
          user: null,
          isAuth: false,
          loading: false,
        });
        return;
      }

      const { data } = await axios.get(`${user_service}/api/v1/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      set({
        user: data,
        isAuth: true,
        loading: false,
        apiError: null,
      });
    } catch (error) {
      set({
        user: null,
        isAuth: false,
        loading: false,
        apiError: getApiErrorMessage(error, "Failed to fetch user profile"),
      });
    }
  },

  fetchBlogs: async (params) => {
    set({
      blogLoading: true,
    });

    try {
      const query = params?.searchQuery ?? get().searchQuery;
      const selectedCategory = params?.category ?? get().category;

      const { data } = await axios.get(`${blog_service}/api/v1/blog/all`, {
        params: {
          searchQuery: query,
          category: selectedCategory,
        },
      });

      set({
        blogs: data,
        apiError: null,
      });
    } catch (error) {
      set({
        apiError: getApiErrorMessage(error, "Failed to fetch blogs"),
        blogs: [],
      });
    } finally {
      set({
        blogLoading: false,
      });
    }
  },

  getSavedBlogs: async () => {
    const token = getAuthToken();
    if (!token) {
      set({
        savedBlogs: null,
      });
      return;
    }

    try {
      const { data } = await axios.get(`${blog_service}/api/v1/blog/saved/all`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      set({
        savedBlogs: normalizeSavedBlogs(data),
        apiError: null,
      });
    } catch (error) {
      set({
        apiError: getApiErrorMessage(error, "Failed to fetch saved blogs"),
        savedBlogs: [],
      });
    }
  },

  logoutUser: async () => {
    Cookies.remove("token", { path: "/" });
    set({
      user: null,
      isAuth: false,
      savedBlogs: null,
    });
    toast.success("User logged out");
  },

  initializeAppData: async () => {
    await get().fetchUser();
    await get().getSavedBlogs();
  },
}));

export type { AppDataStore };
