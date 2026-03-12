"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { memo, useEffect, useRef } from "react";
import { BlogListState } from "../types";

interface DraftsSectionProps {
  draftState: BlogListState;
  draftCount: number;
  onLoadMoreDrafts: () => void;
  onOpenDraft: (blogId: string | number) => void;
}

const BlogListSkeleton = ({ rows = 4 }: { rows?: number }) => (
  <div className="space-y-2">
    {Array.from({ length: rows }).map((_, index) => (
      <div key={`draft-skeleton-${index}`} className="premium-list-item animate-pulse space-y-2 p-3">
        <div className="h-3.5 w-3/4 rounded-md bg-muted" />
        <div className="h-3 w-1/2 rounded-md bg-muted" />
      </div>
    ))}
  </div>
);

const DraftsSection = ({ draftState, draftCount, onLoadMoreDrafts, onOpenDraft }: DraftsSectionProps) => {
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const anchor = loadMoreRef.current;

    if (!anchor) {
      return;
    }

    if (!draftState.hasMore || draftState.loadingMore || !draftState.initialized || draftState.items.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry.isIntersecting) {
          return;
        }

        onLoadMoreDrafts();
      },
      { rootMargin: "280px 0px 280px 0px", threshold: 0.01 }
    );

    observer.observe(anchor);

    return () => observer.disconnect();
  }, [onLoadMoreDrafts, draftState.hasMore, draftState.loadingMore, draftState.initialized, draftState.items.length]);

  return (
    <Card className="premium-panel border-0">
      <CardContent className="space-y-4 p-5 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="premium-section-title text-2xl font-semibold text-foreground">Your Drafts</h2>
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            {draftCount} drafts
          </span>
        </div>

        {!draftState.initialized && draftState.loading ? (
          <BlogListSkeleton rows={4} />
        ) : draftState.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card/70 p-4 text-sm text-muted-foreground">
            No drafts yet. Start writing and save as draft to continue later.
          </p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              {draftState.items.map((blog) => (
                <div key={String(blog.id)} className="premium-list-item p-4">
                  <p className="line-clamp-1 text-base font-semibold text-foreground">
                    {blog.title?.trim() ? blog.title : "Untitled draft"}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {blog.description?.trim()
                      ? blog.description
                      : "No description yet. Open this draft and continue writing."}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">draft | {blog.category || "General"}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => onOpenDraft(blog.id)}
                    >
                      Continue Editing
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {draftState.loadingMore && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="premium-list-item p-4">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="mt-2 h-3 w-full animate-pulse rounded bg-muted" />
                  <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-muted" />
                </div>
                <div className="premium-list-item p-4">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="mt-2 h-3 w-full animate-pulse rounded bg-muted" />
                  <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-muted" />
                </div>
              </div>
            )}

            {draftState.hasMore && (
              <div ref={loadMoreRef} className="flex min-h-12 items-center justify-center py-2 text-xs text-muted-foreground">
                {draftState.loadingMore ? "Loading next drafts..." : "Scroll to load more drafts"}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default memo(DraftsSection);
