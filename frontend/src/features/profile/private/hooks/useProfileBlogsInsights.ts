"use client";

import { buildInsightParams, InsightFilterValue } from "@/components/charts/InsightFilters";
import { Blog, author_service, blog_service, comments_service } from "@/context/AppContext";
import { getApiErrorMessage } from "@/lib/api-error";
import axios from "axios";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { formatBlogDateLabel, toCount } from "../../shared/metrics";
import {
  AuthorTotals,
  BlogInsightsResponse,
  BlogListKind,
  BlogListState,
  BLOG_PAGE_SIZE,
  createInitialBlogListState,
  initialAuthorTotals,
  SelectedBlogStats,
  UserBlogsResponse,
} from "../types";
import { mergeBlogsById, toSeries } from "../utils";

interface UseProfileBlogsInsightsOptions {
  userId?: string;
  getHeaders: () => { Authorization: string };
}

export const useProfileBlogsInsights = ({ userId, getHeaders }: UseProfileBlogsInsightsOptions) => {
  const [publishedState, setPublishedState] = useState<BlogListState>(createInitialBlogListState);
  const [draftState, setDraftState] = useState<BlogListState>(createInitialBlogListState);
  const [authorTotals, setAuthorTotals] = useState<AuthorTotals>(initialAuthorTotals);

  const [selectedBlogId, setSelectedBlogId] = useState<number | null>(null);
  const [blogInsights, setBlogInsights] = useState<BlogInsightsResponse | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const currentMonthRange = useMemo(() => {
    const [yearRaw, monthRaw] = currentMonth.split("-");
    const year = Number(yearRaw);
    const monthIndex = Number(monthRaw) - 1;
    if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
      return { from: "", to: "" };
    }

    const start = new Date(Date.UTC(year, monthIndex, 1));
    const end = new Date(Date.UTC(year, monthIndex + 1, 0));
    const pad2 = (value: number) => String(value).padStart(2, "0");
    const from = `${start.getUTCFullYear()}-${pad2(start.getUTCMonth() + 1)}-${pad2(start.getUTCDate())}`;
    const to = `${end.getUTCFullYear()}-${pad2(end.getUTCMonth() + 1)}-${pad2(end.getUTCDate())}`;
    return { from, to };
  }, [currentMonth]);
  const [insightFilter, setInsightFilter] = useState<InsightFilterValue>({
    granularity: "day",
    month: currentMonth,
    from: currentMonthRange.from,
    to: currentMonthRange.to,
  });
  const [selectedBlogStats, setSelectedBlogStats] = useState<SelectedBlogStats>({
    likesCount: 0,
    commentsCount: 0,
    isActive: true,
  });
  const [selectedBlogStatsLoading, setSelectedBlogStatsLoading] = useState(false);
  const listRequestInFlightRef = useRef({
    published: false,
    draft: false,
  });

  const isInitialBlogLoad =
    (!publishedState.initialized && publishedState.loading) ||
    (!draftState.initialized && draftState.loading);

  const setBlogStateByKind = useCallback(
    (kind: BlogListKind, updater: React.SetStateAction<BlogListState>) => {
      if (kind === "published") {
        setPublishedState(updater);
        return;
      }

      setDraftState(updater);
    },
    []
  );

  const applyAuthorTotals = useCallback((payload?: Partial<AuthorTotals>) => {
    if (!payload) {
      return;
    }

    setAuthorTotals({
      totalBlogs: toCount(payload.totalBlogs),
      publishedBlogs: toCount(payload.publishedBlogs),
      draftBlogs: toCount(payload.draftBlogs),
      totalLikes: toCount(payload.totalLikes),
      totalViews: toCount(payload.totalViews),
    });
  }, []);

  const fetchBlogPage = useCallback(
    async (kind: BlogListKind, page: number, append = false) => {
      if (!userId) {
        return;
      }

      if (listRequestInFlightRef.current[kind]) {
        return;
      }

      listRequestInFlightRef.current[kind] = true;

      setBlogStateByKind(kind, (previous) => ({
        ...previous,
        loading: !append,
        loadingMore: append,
      }));

      try {
        const { data } = await axios.get<UserBlogsResponse>(`${blog_service}/api/v1/blog/user/${userId}`, {
          headers: getHeaders(),
          params: {
            page,
            limit: BLOG_PAGE_SIZE,
            publishStatus: kind,
          },
        });

        const incomingItems = Array.isArray(data?.items) ? data.items : [];

        setBlogStateByKind(kind, (previous) => ({
          ...previous,
          items: append ? mergeBlogsById(previous.items, incomingItems) : incomingItems,
          page: Number(data?.page ?? page),
          total: toCount(data?.total ?? 0),
          hasMore: Boolean(data?.hasMore),
          loading: false,
          loadingMore: false,
          initialized: true,
        }));

        applyAuthorTotals(data?.authorTotals);
      } catch (error) {
        setBlogStateByKind(kind, (previous) => ({
          ...previous,
          loading: false,
          loadingMore: false,
          initialized: true,
        }));

        toast.error(
          getApiErrorMessage(
            error,
            kind === "published" ? "Failed to load published blogs" : "Failed to load draft blogs"
          )
        );
      } finally {
        listRequestInFlightRef.current[kind] = false;
      }
    },
    [applyAuthorTotals, getHeaders, setBlogStateByKind, userId]
  );

  const refreshBlogLists = useCallback(async () => {
    await Promise.all([fetchBlogPage("published", 1, false), fetchBlogPage("draft", 1, false)]);
  }, [fetchBlogPage]);

  const fetchSelectedBlogInsights = useCallback(async () => {
    if (!selectedBlogId) {
      setBlogInsights(null);
      return;
    }

    try {
      setInsightLoading(true);
      const { data } = await axios.get(`${blog_service}/api/v1/blog/${selectedBlogId}/insights`, {
        headers: getHeaders(),
        params: buildInsightParams(insightFilter),
      });

      setBlogInsights(data ?? null);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to load blog insights"));
    } finally {
      setInsightLoading(false);
    }
  }, [getHeaders, insightFilter, selectedBlogId]);

  const fetchSelectedBlogStats = useCallback(async () => {
    if (!selectedBlogId) {
      setSelectedBlogStats({
        likesCount: 0,
        commentsCount: 0,
        isActive: true,
      });
      return;
    }

    try {
      setSelectedBlogStatsLoading(true);

      const [blogResult, commentsResult] = await Promise.allSettled([
        axios.get(`${author_service}/api/v1/blog/${selectedBlogId}`, {
          headers: getHeaders(),
        }),
        axios.get(`${comments_service}/api/v1/comment/${selectedBlogId}`, {
          params: {
            page: 1,
            limit: 1,
          },
        }),
      ]);

      let likesCount = 0;
      let isActive = true;
      let commentsCount = 0;

      if (blogResult.status === "fulfilled") {
        const blogData = blogResult.value.data as Partial<Blog>;
        likesCount = toCount(blogData.likesCount ?? blogData.likes_count ?? 0);
        isActive =
          typeof blogData.isActive === "boolean"
            ? blogData.isActive
            : typeof blogData.is_active === "boolean"
              ? blogData.is_active
              : true;
      }

      if (commentsResult.status === "fulfilled") {
        commentsCount = toCount((commentsResult.value.data as { total?: unknown })?.total ?? 0);
      }

      setSelectedBlogStats({
        likesCount,
        commentsCount,
        isActive,
      });
    } catch {
      setSelectedBlogStats({
        likesCount: 0,
        commentsCount: 0,
        isActive: true,
      });
    } finally {
      setSelectedBlogStatsLoading(false);
    }
  }, [getHeaders, selectedBlogId]);

  const loadMorePublished = useCallback(() => {
    if (!publishedState.hasMore || publishedState.loadingMore) {
      return;
    }

    void fetchBlogPage("published", publishedState.page + 1, true);
  }, [fetchBlogPage, publishedState.hasMore, publishedState.loadingMore, publishedState.page]);

  const loadMoreDrafts = useCallback(() => {
    if (!draftState.hasMore || draftState.loadingMore) {
      return;
    }

    void fetchBlogPage("draft", draftState.page + 1, true);
  }, [draftState.hasMore, draftState.loadingMore, draftState.page, fetchBlogPage]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    void refreshBlogLists();
  }, [refreshBlogLists, userId]);

  useEffect(() => {
    if (publishedState.items.length === 0) {
      setSelectedBlogId(null);
      return;
    }

    const alreadySelected = publishedState.items.some((blog) => Number(blog.id) === selectedBlogId);

    if (!alreadySelected) {
      setSelectedBlogId(Number(publishedState.items[0].id));
    }
  }, [publishedState.items, selectedBlogId]);

  useEffect(() => {
    if (!selectedBlogId) {
      return;
    }

    void fetchSelectedBlogInsights();
  }, [fetchSelectedBlogInsights, selectedBlogId]);

  useEffect(() => {
    if (!selectedBlogId) {
      return;
    }

    void fetchSelectedBlogStats();
  }, [fetchSelectedBlogStats, selectedBlogId]);

  const insightsSeries = useMemo(() => toSeries(blogInsights?.series), [blogInsights]);

  const selectedBlog = useMemo(() => {
    if (!selectedBlogId) {
      return null;
    }

    return publishedState.items.find((blog) => Number(blog.id) === selectedBlogId) ?? null;
  }, [publishedState.items, selectedBlogId]);

  const selectedBlogTitle = selectedBlog?.title?.trim() || "Select a published blog";
  const selectedBlogCategory = selectedBlog?.category?.trim() || "General";
  const selectedBlogDateLabel = formatBlogDateLabel(selectedBlog?.createAt ?? selectedBlog?.created_at);
  const selectedBlogUrl = selectedBlog ? `/blog/${selectedBlog.id}` : "#";
  const hasSelectedBlog = Boolean(selectedBlogId && selectedBlog);

  return {
    authorTotals,
    draftState,
    publishedState,
    isInitialBlogLoad,
    selectedBlog,
    selectedBlogId,
    setSelectedBlogId,
    selectedBlogTitle,
    selectedBlogCategory,
    selectedBlogDateLabel,
    selectedBlogUrl,
    hasSelectedBlog,
    blogInsights,
    insightsSeries,
    insightFilter,
    setInsightFilter,
    insightLoading,
    selectedBlogStats,
    selectedBlogStatsLoading,
    refreshBlogLists,
    fetchSelectedBlogInsights,
    loadMoreDrafts,
    loadMorePublished,
  };
};
