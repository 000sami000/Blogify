"use client";

import BlogCard from "@/components/BlogCard";
import { BlogCardSkeletonGrid } from "@/components/skeletons/BlogCardSkeleton";
import { Button } from "@/components/ui/button";
import { blog_service, useAppData } from "@/context/AppContext";
import { getAuthToken } from "@/lib/auth-token";
import { getApiErrorMessage } from "@/lib/api-error";
import { ArrowUp } from "lucide-react";
import axios from "axios";
import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SavedBlog = {
  id: string;
  title: string;
  description: string;
  image: string;
  category: string;
  created_at?: string;
  createAt?: string;
  likesCount?: number;
  viewsCount?: number;
  likes_count?: number;
  views_count?: number;
};

interface PaginatedSavedBlogsResponse {
  items: SavedBlog[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

const SAVED_PAGE_SIZE = 10;

const normalizeSavedResponse = (
  data: unknown,
  fallbackPage: number
): PaginatedSavedBlogsResponse => {
  if (!data || typeof data !== "object") {
    return {
      items: [],
      page: fallbackPage,
      limit: SAVED_PAGE_SIZE,
      total: 0,
      hasMore: false,
    };
  }

  const payload = data as Partial<PaginatedSavedBlogsResponse> & { items?: unknown };
  const items = Array.isArray(payload.items) ? (payload.items as SavedBlog[]) : [];
  const limit =
    typeof payload.limit === "number" && payload.limit > 0
      ? payload.limit
      : SAVED_PAGE_SIZE;
  const page =
    typeof payload.page === "number" && payload.page > 0
      ? payload.page
      : fallbackPage;

  return {
    items,
    page,
    limit,
    total: typeof payload.total === "number" && payload.total >= 0 ? payload.total : items.length,
    hasMore: typeof payload.hasMore === "boolean" ? payload.hasMore : items.length === limit,
  };
};

const SavedBlogs = () => {
  const { isAuth, setApiErrorMessage } = useAppData();

  const [savedItems, setSavedItems] = useState<SavedBlog[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTopButton, setShowTopButton] = useState(false);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const pageCacheRef = useRef<Map<number, SavedBlog[]>>(new Map());
  const requestInFlightRef = useRef(false);

  const dedupeMerge = useCallback((existing: SavedBlog[], incoming: SavedBlog[]) => {
    const seen = new Set(existing.map((blog) => String(blog.id)));
    const next = [...existing];

    for (const item of incoming) {
      const id = String(item.id);
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      next.push(item);
    }

    return next;
  }, []);

  const fetchSavedPage = useCallback(
    async (targetPage: number, mode: "append" | "replace" = "append") => {
      if (requestInFlightRef.current) {
        return;
      }

      const cachedPage = pageCacheRef.current.get(targetPage);
      if (cachedPage) {
        setSavedItems((prev) =>
          mode === "replace" ? cachedPage : dedupeMerge(prev, cachedPage)
        );
        setPage(targetPage);
        setHasMore(cachedPage.length === SAVED_PAGE_SIZE);
        setError(null);
        return;
      }

      const token = getAuthToken();
      if (!token) {
        setLoadingInitial(false);
        return;
      }

      requestInFlightRef.current = true;
      if (targetPage === 1) {
        setLoadingInitial(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const { data } = await axios.get(`${blog_service}/api/v1/blog/saved`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          params: {
            page: targetPage,
            limit: SAVED_PAGE_SIZE,
          },
        });

        const parsed = normalizeSavedResponse(data, targetPage);
        pageCacheRef.current.set(targetPage, parsed.items);

        setSavedItems((prev) =>
          mode === "replace" ? parsed.items : dedupeMerge(prev, parsed.items)
        );
        setPage(parsed.page);
        setHasMore(parsed.hasMore);
        setError(null);
        setApiErrorMessage(null);
      } catch (err) {
        const message = getApiErrorMessage(err, "Failed to load saved blogs");
        setError(message);
        setApiErrorMessage(message);
        setHasMore(false);
      } finally {
        requestInFlightRef.current = false;
        setLoadingInitial(false);
        setLoadingMore(false);
      }
    },
    [dedupeMerge, setApiErrorMessage]
  );

  const loadFirstPage = useCallback(async () => {
    setSavedItems([]);
    setPage(0);
    setHasMore(true);
    setError(null);
    pageCacheRef.current.clear();
    await fetchSavedPage(1, "replace");
  }, [fetchSavedPage]);

  useEffect(() => {
    if (!isAuth) {
      setLoadingInitial(false);
      return;
    }

    void loadFirstPage();
  }, [isAuth, loadFirstPage]);

  useEffect(() => {
    const pageCache = pageCacheRef.current;

    const onScroll = () => {
      setShowTopButton(window.scrollY > 420);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      pageCache.clear();
    };
  }, []);

  useEffect(() => {
    const anchor = loadMoreRef.current;
    if (!anchor) {
      return;
    }

    observerRef.current?.disconnect();

    if (!hasMore || loadingMore || loadingInitial || page < 1 || error) {
      return;
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry.isIntersecting || requestInFlightRef.current) {
          return;
        }

        void fetchSavedPage(page + 1, "append");
      },
      { rootMargin: "260px 0px 260px 0px" }
    );

    observerRef.current.observe(anchor);

    return () => observerRef.current?.disconnect();
  }, [error, fetchSavedPage, hasMore, loadingInitial, loadingMore, page]);

  const renderedItems = useMemo(() => savedItems, [savedItems]);

  if (!isAuth) {
    return (
      <section className="space-y-5 pt-4">
        <div className="glass-card rounded-3xl p-6 text-center sm:p-8">
          <h1 className="premium-section-title text-3xl font-semibold text-foreground">Saved Blogs</h1>
          <p className="mt-2 text-sm text-muted-foreground">Login to view your bookmarked stories.</p>
          <Link
            href="/login"
            className="mt-4 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go to Login
          </Link>
        </div>
      </section>
    );
  }

  if (loadingInitial) {
    return (
      <section className="space-y-5 pt-4">
        <div className="glass-card rounded-3xl p-6 sm:p-8">
          <div className="space-y-3">
            <div className="h-3 w-24 animate-pulse rounded bg-ft-border" />
            <div className="h-10 w-56 animate-pulse rounded bg-ft-border" />
            <div className="h-4 w-80 max-w-full animate-pulse rounded bg-ft-border" />
          </div>
        </div>
        <BlogCardSkeletonGrid count={6} />
      </section>
    );
  }

  return (
    <section className="space-y-5 pt-4">
      <div className="glass-card rounded-3xl p-6 sm:p-8">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Library</p>
        <h1 className="premium-section-title mt-2 text-4xl font-semibold text-foreground">Saved Blogs</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A personal shelf of stories you bookmarked to revisit.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          <p>{error}</p>
          <Button className="mt-3 rounded-full" onClick={() => void loadFirstPage()}>
            Retry
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {renderedItems.length > 0 ? (
          renderedItems.map((blog, index) => (
            <div
              key={String(blog.id)}
              className="animate-fade-up"
              style={{ animationDelay: `${Math.min(index * 40, 240)}ms` }}
            >
              <BlogCard
                image={blog.image}
                title={blog.title}
                desc={blog.description}
                id={String(blog.id)}
                time={blog.createAt ?? blog.created_at}
                category={blog.category}
                likesCount={Number(blog.likesCount ?? blog.likes_count ?? 0)}
                viewsCount={Number(blog.viewsCount ?? blog.views_count ?? 0)}
              />
            </div>
          ))
        ) : (
          !error && (
            <div className="premium-panel col-span-full p-10 text-center text-muted-foreground">
              No saved blogs yet.
            </div>
          )
        )}
      </div>

      {loadingMore && renderedItems.length > 0 && !error && (
        <BlogCardSkeletonGrid count={3} />
      )}

      {hasMore && renderedItems.length > 0 && !error && (
        <div ref={loadMoreRef} className="flex min-h-12 items-center justify-center py-2 text-xs text-muted-foreground">
          {loadingMore ? "Loading next set..." : "Scroll to load more"}
        </div>
      )}

      {showTopButton && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-40 inline-flex size-11 items-center justify-center rounded-full border border-ft-border bg-ft-card text-ft-text shadow-ft-soft transition hover:-translate-y-0.5"
          aria-label="Back to top"
        >
          <ArrowUp className="size-4" />
        </button>
      )}
    </section>
  );
};

export default SavedBlogs;
