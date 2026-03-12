import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface CommentListSkeletonProps {
  count?: number;
  className?: string;
}

const CommentItemSkeleton = () => (
  <article className="rounded-xl border border-ft-border bg-ft-card/50 p-4">
    <div className="flex items-start gap-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="w-full space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <div className="flex items-center gap-2 pt-1">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </div>
    </div>
  </article>
);

export const CommentListSkeleton = ({ count = 3, className }: CommentListSkeletonProps) => (
  <div className={cn("space-y-4", className)}>
    {Array.from({ length: count }).map((_, index) => (
      <CommentItemSkeleton key={`comment-skeleton-${index}`} />
    ))}
  </div>
);
