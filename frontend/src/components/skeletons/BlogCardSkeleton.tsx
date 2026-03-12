import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface BlogCardSkeletonProps {
  className?: string;
}

export const BlogCardSkeleton = ({ className }: BlogCardSkeletonProps) => (
  <Card className={cn("premium-panel overflow-hidden border-ft-border/90 py-0", className)}>
    <Skeleton className="h-[220px] w-full rounded-none" />
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="h-6 w-4/5" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div className="flex items-center justify-between pt-1">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  </Card>
);

interface BlogCardSkeletonGridProps {
  count?: number;
  className?: string;
}

export const BlogCardSkeletonGrid = ({ count = 6, className }: BlogCardSkeletonGridProps) => (
  <div className={cn("grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3", className)}>
    {Array.from({ length: count }).map((_, index) => (
      <BlogCardSkeleton key={`blog-card-skeleton-${index}`} />
    ))}
  </div>
);
