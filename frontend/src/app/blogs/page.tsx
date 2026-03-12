"use client";

import BlogCard from "@/components/BlogCard";
import { BlogCardSkeletonGrid } from "@/components/skeletons/BlogCardSkeleton";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { Blog, blog_service, useAppData } from "@/context/AppContext";
import { getApiErrorMessage } from "@/lib/api-error";
import axios from "axios";
import { CheckCircle2, Filter, RefreshCw } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";

const BLOGS_PAGE_SIZE = 10;

interface PaginatedBlogsResponse {
  items: Blog[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

const normalizeBlogsResponse = (
  data: unknown,
  fallbackPage: number
): PaginatedBlogsResponse => {
  if (Array.isArray(data)) {
    const items = data as Blog[];
    return {
      items,
      page: fallbackPage,
      limit: BLOGS_PAGE_SIZE,
      total: items.length,
      hasMore: items.length === BLOGS_PAGE_SIZE,
    };
  }

  if (data && typeof data === "object") {
    const payload = data as Partial<PaginatedBlogsResponse> & {
      items?: unknown;
    };

    const items = Array.isArray(payload.items) ? (payload.items as Blog[]) : [];
    const limit =
      typeof payload.limit === "number" && payload.limit > 0
        ? payload.limit
        : BLOGS_PAGE_SIZE;
    const page =
      typeof payload.page === "number" && payload.page > 0
        ? payload.page
        : fallbackPage;

    return {
      items,
      page,
      limit,
      total:
        typeof payload.total === "number" && payload.total >= 0
          ? payload.total
          : items.length,
      hasMore:
        typeof payload.hasMore === "boolean"
          ? payload.hasMore
          : items.length === limit,
    };
  }

  return {
    items: [],
    page: fallbackPage,
    limit: BLOGS_PAGE_SIZE,
    total: 0,
    hasMore: false,
  };
};

const Blogs = () => {
  const { toggleSidebar } = useSidebar();
  const { loading, searchQuery, category, setApiErrorMessage } = useAppData();

  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const requestInFlightRef = useRef(false);
  const blogsRef = useRef<Blog[]>([]);

  useEffect(() => {
    blogsRef.current = blogs;
  }, [blogs]);

  const fetchPage = useCallback(
    async (targetPage: number, mode: "append" | "replace" = "append") => {
      if (requestInFlightRef.current) {
        return;
      }

      requestInFlightRef.current = true;
      setFetching(true);

      try {
        const { data } = await axios.get(`${blog_service}/api/v1/blog/all`, {
          params: {
            searchQuery,
            category,
            page: targetPage,
            limit: BLOGS_PAGE_SIZE,
          },
        });

        const parsed = normalizeBlogsResponse(data, targetPage);
        const current = blogsRef.current;
        const currentIds = new Set(current.map((item) => String(item.id)));

        const merged =
          mode === "replace"
            ? parsed.items
            : [
                ...current,
                ...parsed.items.filter((item) => !currentIds.has(String(item.id))),
              ];

        const appendedCount =
          mode === "append" ? Math.max(merged.length - current.length, 0) : merged.length;

        setBlogs(merged);
        setPage(parsed.page);
        setHasMore(parsed.hasMore && (mode !== "append" || appendedCount > 0));
        setError(null);
        setApiErrorMessage(null);
      } catch (err) {
        const message = getApiErrorMessage(err, "Failed to fetch blogs");
        setError(message);
        setApiErrorMessage(message);
        setHasMore(false);
      } finally {
        setFetching(false);
        requestInFlightRef.current = false;
      }
    },
    [searchQuery, category, setApiErrorMessage]
  );

  const resetAndFetch = useCallback(async () => {
    setBlogs([]);
    setPage(0);
    setHasMore(true);
    setError(null);
    await fetchPage(1, "replace");
  }, [fetchPage]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void resetAndFetch();
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, category, resetAndFetch]);

  useEffect(() => {
    const anchor = loadMoreRef.current;

    if (!anchor) {
      return;
    }

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    if (!hasMore || fetching || page < 1 || error) {
      return;
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !requestInFlightRef.current) {
          void fetchPage(page + 1, "append");
        }
      },
      { rootMargin: "300px 0px 300px 0px" }
    );

    observerRef.current.observe(anchor);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [hasMore, fetching, page, error, fetchPage]);

  return (
    <section className="space-y-6 pb-6 pt-4">
      {loading ? (
        <div className="animate-fade-up space-y-5">
          <div className="glass-card relative overflow-hidden rounded-3xl p-6 sm:p-8">
            <div className="space-y-3">
              <div className="h-3 w-24 animate-pulse rounded bg-ft-border" />
              <div className="h-10 w-full max-w-2xl animate-pulse rounded bg-ft-border" />
              <div className="h-4 w-full max-w-3xl animate-pulse rounded bg-ft-border" />
            </div>
          </div>
          <BlogCardSkeletonGrid count={6} />
        </div>
      ) : (
        <div className="animate-fade-up">
          <div className="glass-card relative overflow-hidden rounded-3xl p-6 sm:p-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-ft-sky/30 blur-2xl" />
            <div className="pointer-events-none absolute -left-10 bottom-2 h-32 w-32 rounded-full bg-ft-accent/20 blur-2xl" />
            <p className="text-xs uppercase tracking-[0.2em] text-ft-muted">Future Feed</p>
            <h1 className="premium-section-title mt-2 text-4xl font-semibold sm:text-5xl">
              Editorial Stories For Modern Readers
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-ft-muted sm:text-base">
              Curated posts from creators across technology, health, finance, and culture,
              delivered in a clean, immersive reading experience.
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <Button
              onClick={toggleSidebar}
              className="rounded-full bg-ft-accent text-ft-bg hover:brightness-95"
            >
              <Filter size={18} />
              <span>Filter Blogs</span>
            </Button>
            <Button
              variant="outline"
              className="rounded-full border-ft-border bg-ft-card text-ft-text"
              onClick={() => {
                void resetAndFetch();
              }}
            >
              <RefreshCw size={16} className="mr-2" />
              Refresh
            </Button>
          </div>

          {fetching && blogs.length === 0 ? (
            <BlogCardSkeletonGrid count={6} className="mt-5" />
          ) : (
            <>
              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {blogs.length === 0 && !error && (
                  <div className="premium-panel col-span-full p-10 text-center text-ft-muted">
                    No blogs yet. Try changing filters or check back soon.
                  </div>
                )}
                {error && (
                  <div className="premium-panel col-span-full border border-red-500/35 bg-red-500/10 p-6 text-center text-red-200">
                    <p>{error}</p>
                    <Button
                      onClick={() => {
                        void resetAndFetch();
                      }}
                      className="mt-3 rounded-full"
                    >
                      Retry
                    </Button>
                  </div>
                )}
                {blogs.map((e) => {
                  const blogTime = e.createAt ?? e.created_at;
                  const likesCount = Number(e.likesCount ?? e.likes_count ?? 0);
                  const viewsCount = Number(e.viewsCount ?? e.views_count ?? 0);

                  return (
                    <BlogCard
                      key={String(e.id)}
                      image={e.image}
                      title={e.title}
                      desc={e.description}
                      id={String(e.id)}
                      time={blogTime}
                      category={e.category}
                      likesCount={likesCount}
                      viewsCount={viewsCount}
                    />
                  );
                })}
              </div>

              {fetching && blogs.length > 0 && !error && (
                <BlogCardSkeletonGrid count={3} className="mt-5" />
              )}

              {hasMore && blogs.length > 0 && !error && (
                <div ref={loadMoreRef} className="flex items-center justify-center py-4">
                  <p className="text-xs text-ft-muted">{fetching ? "Loading next set..." : "Scroll to load more"}</p>
                </div>
              )}
              {!hasMore && blogs.length > 0 && !error && (
                <div className="col-span-full mt-6 flex justify-center">
                  <span className="inline-flex items-center gap-2 rounded-full border border-ft-border/60 bg-ft-panel/70 px-4 py-2 text-xs text-ft-muted shadow-sm">
                    <CheckCircle2 className="size-4 text-emerald-400" />
                    You have reached the end.
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
};

export default Blogs;
