"use client";

import InsightFilters, { InsightFilterValue } from "@/components/charts/InsightFilters";
import InsightsLineChart, { InsightPoint } from "@/components/charts/InsightsLineChart";
import { Blog } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CalendarDays,
  Eye,
  ExternalLink,
  Heart,
  MessageCircle,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { memo, useEffect, useRef } from "react";
import { compactCount, toCount } from "../../shared/metrics";
import {
  AuthorTotals,
  BlogInsightsResponse,
  BlogListState,
  SelectedBlogStats,
} from "../types";

interface BlogsInsightsSectionProps {
  authorTotals: AuthorTotals;
  publishedState: BlogListState;
  draftState: BlogListState;
  selectedBlogId: number | null;
  onSelectBlog: (blogId: number) => void;
  selectedBlog: Blog | null;
  selectedBlogTitle: string;
  selectedBlogCategory: string;
  selectedBlogDateLabel: string;
  hasSelectedBlog: boolean;
  blogInsights: BlogInsightsResponse | null;
  insightsSeries: InsightPoint[];
  insightFilter: InsightFilterValue;
  onInsightFilterChange: (value: InsightFilterValue) => void;
  onApplyInsights: () => void;
  insightLoading: boolean;
  selectedBlogStats: SelectedBlogStats;
  selectedBlogStatsLoading: boolean;
  onRefresh: () => void;
  onLoadMorePublished: () => void;
  onOpenSelectedBlog: () => void;
}

const BlogListSkeleton = ({ rows = 4 }: { rows?: number }) => (
  <div className="space-y-2">
    {Array.from({ length: rows }).map((_, index) => (
      <div key={`blog-skeleton-${index}`} className="premium-list-item animate-pulse space-y-2 p-3">
        <div className="h-3.5 w-3/4 rounded-md bg-muted" />
        <div className="h-3 w-1/2 rounded-md bg-muted" />
      </div>
    ))}
  </div>
);

const ChartSkeleton = () => (
  <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
    <div className="h-4 w-40 animate-pulse rounded-md bg-muted" />
    <div className="h-56 w-full animate-pulse rounded-xl bg-muted" />
  </div>
);

const BlogsInsightsSection = ({
  authorTotals,
  publishedState,
  draftState,
  selectedBlogId,
  onSelectBlog,
  selectedBlog,
  selectedBlogTitle,
  selectedBlogCategory,
  selectedBlogDateLabel,
  hasSelectedBlog,
  blogInsights,
  insightsSeries,
  insightFilter,
  onInsightFilterChange,
  onApplyInsights,
  insightLoading,
  selectedBlogStats,
  selectedBlogStatsLoading,
  onRefresh,
  onLoadMorePublished,
  onOpenSelectedBlog,
}: BlogsInsightsSectionProps) => {
  const publishedScrollRef = useRef<HTMLDivElement | null>(null);
  const publishedLoadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const scrollRoot = publishedScrollRef.current;
    const anchor = publishedLoadMoreRef.current;

    if (!scrollRoot || !anchor) {
      return;
    }

    if (
      !publishedState.hasMore ||
      publishedState.loadingMore ||
      !publishedState.initialized ||
      publishedState.items.length === 0
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry.isIntersecting) {
          return;
        }

        onLoadMorePublished();
      },
      {
        root: scrollRoot,
        rootMargin: "220px 0px 220px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(anchor);

    return () => observer.disconnect();
  }, [
    onLoadMorePublished,
    publishedState.hasMore,
    publishedState.loadingMore,
    publishedState.initialized,
    publishedState.items.length,
  ]);

  return (
    <Card className="premium-panel border-0">
      <CardContent className="space-y-4 p-5 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="premium-section-title text-2xl font-semibold text-foreground">Your Blogs & Insights</h2>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={onRefresh}
            disabled={publishedState.loading || draftState.loading}
          >
            <RefreshCcw className="mr-1.5 size-4" />
            Refresh Blogs
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-3 rounded-2xl border border-border/90 bg-card/95 p-3">
            <div className="rounded-xl border border-border bg-gradient-to-br from-white to-muted/40 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Published Blogs</p>
                <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground">
                  {authorTotals.publishedBlogs}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Pick any blog from this list to inspect traffic, likes, comments, and current status.
              </p>
            </div>

            {!publishedState.initialized && publishedState.loading ? (
              <BlogListSkeleton rows={5} />
            ) : publishedState.items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-card/70 p-4 text-sm text-muted-foreground">
                No published blogs found.
              </p>
            ) : (
              <div ref={publishedScrollRef} className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
                {publishedState.items.map((blog) => {
                  const id = Number(blog.id);
                  const isSelected = selectedBlogId === id;
                  const blogViews = toCount(blog.viewsCount ?? blog.views_count ?? 0);
                  const blogLikes = toCount(blog.likesCount ?? blog.likes_count ?? 0);
                  const category = blog.category?.trim() || "General";

                  return (
                    <button
                      key={String(blog.id)}
                      type="button"
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        isSelected
                          ? "border-primary/60 bg-primary/95 text-primary-foreground shadow"
                          : "border-border bg-card hover:border-primary/40 hover:bg-muted/40"
                      }`}
                      onClick={() => onSelectBlog(id)}
                    >
                      <p className="line-clamp-1 text-sm font-semibold">{blog.title || "Untitled blog"}</p>
                      <div
                        className={`mt-1 flex items-center gap-2 text-[11px] ${
                          isSelected ? "text-primary-foreground/90" : "text-muted-foreground"
                        }`}
                      >
                        <span className="rounded-full border border-current/20 px-2 py-0.5">{category}</span>
                        <span className="inline-flex items-center gap-1">
                          <Eye className="size-3.5" />
                          {compactCount(blogViews)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Heart className="size-3.5" />
                          {compactCount(blogLikes)}
                        </span>
                      </div>
                    </button>
                  );
                })}

                {publishedState.hasMore && (
                  <div ref={publishedLoadMoreRef} className="py-2">
                    {publishedState.loadingMore ? (
                      <BlogListSkeleton rows={2} />
                    ) : (
                      <p className="text-center text-xs text-muted-foreground">Scroll for more published blogs</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-2xl border border-border/90 bg-card/95 p-3">
            <div className="premium-panel-soft flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Selected Blog</p>
                <p className="line-clamp-1 text-base font-semibold text-foreground">{selectedBlogTitle}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-1">
                    <CalendarDays className="size-3.5" />
                    {selectedBlogDateLabel}
                  </span>
                  <span className="rounded-full border border-border bg-card px-2 py-1">
                    Category: {selectedBlogCategory}
                  </span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                disabled={!selectedBlog}
                onClick={onOpenSelectedBlog}
                className="rounded-full"
              >
                Open Blog
                <ExternalLink className="ml-1.5 size-3.5" />
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="premium-kpi flex items-center justify-between gap-3 p-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Views"
                      className="inline-flex size-9 items-center justify-center rounded-full border border-sky-300/50 bg-sky-500/10"
                    >
                      <Eye className="size-4 text-sky-700" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={8}>
                    Views
                  </TooltipContent>
                </Tooltip>
                <p className="text-lg font-semibold text-foreground">
                  {hasSelectedBlog ? compactCount(blogInsights?.totals?.views ?? 0) : "--"}
                </p>
              </div>

              <div className="premium-kpi flex items-center justify-between gap-3 p-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Likes"
                      className="inline-flex size-9 items-center justify-center rounded-full border border-rose-300/50 bg-rose-500/10"
                    >
                      <Heart className="size-4 text-rose-600" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={8}>
                    Likes
                  </TooltipContent>
                </Tooltip>
                <p className="text-lg font-semibold text-foreground">
                  {!hasSelectedBlog
                    ? "--"
                    : selectedBlogStatsLoading
                      ? "..."
                      : compactCount(selectedBlogStats.likesCount)}
                </p>
              </div>

              <div className="premium-kpi flex items-center justify-between gap-3 p-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Comments"
                      className="inline-flex size-9 items-center justify-center rounded-full border border-violet-300/50 bg-violet-500/10"
                    >
                      <MessageCircle className="size-4 text-violet-600" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={8}>
                    Comments
                  </TooltipContent>
                </Tooltip>
                <p className="text-lg font-semibold text-foreground">
                  {!hasSelectedBlog
                    ? "--"
                    : selectedBlogStatsLoading
                      ? "..."
                      : compactCount(selectedBlogStats.commentsCount)}
                </p>
              </div>

              <div className="premium-kpi flex items-center justify-between gap-3 p-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Status"
                      className={`inline-flex size-9 items-center justify-center rounded-full border ${
                        !hasSelectedBlog
                          ? "border-border bg-muted/50"
                          : selectedBlogStats.isActive
                            ? "border-emerald-300/60 bg-emerald-500/10"
                            : "border-rose-300/60 bg-rose-500/10"
                      }`}
                    >
                      <ShieldCheck
                        className={`size-4 ${
                          !hasSelectedBlog
                            ? "text-muted-foreground"
                            : selectedBlogStats.isActive
                              ? "text-emerald-600"
                              : "text-rose-600"
                        }`}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={8}>
                    Status
                  </TooltipContent>
                </Tooltip>
                <p
                  className={`text-lg font-semibold ${
                    !hasSelectedBlog
                      ? "text-muted-foreground"
                      : selectedBlogStats.isActive
                        ? "text-emerald-700"
                        : "text-rose-700"
                  }`}
                >
                  {!hasSelectedBlog
                    ? "--"
                    : selectedBlogStatsLoading
                      ? "..."
                      : selectedBlogStats.isActive
                        ? "Active"
                        : "Inactive"}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card/70 p-3">
              <InsightFilters
                value={insightFilter}
                onChange={onInsightFilterChange}
                onApply={onApplyInsights}
                disabled={insightLoading || !selectedBlogId}
                defaultGranularity="day"
              />

              {!hasSelectedBlog ? (
                <div className="mt-3 flex h-72 items-center justify-center rounded-2xl border border-dashed border-border bg-card text-sm text-muted-foreground">
                  Select a published blog to load insights.
                </div>
              ) : insightLoading ? (
                <div className="mt-3">
                  <ChartSkeleton />
                </div>
              ) : (
                <div className="mt-3">
                  <InsightsLineChart
                    title="Views"
                    data={insightsSeries}
                    color="#0f766e"
                    chartType="bar"
                    heightClassName="h-72"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default memo(BlogsInsightsSection);
