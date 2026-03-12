import { Skeleton } from "@/components/ui/skeleton";

const BlogDetailSkeleton = () => (
  <section className="space-y-6 py-5">
    <article className="overflow-hidden rounded-[28px] border border-ft-border bg-ft-card shadow-ft-soft">
      <div className="relative h-[320px] sm:h-[420px]">
        <Skeleton className="h-full w-full rounded-none" />
      </div>

      <div className="space-y-6 p-5 sm:p-8">
        <div className="space-y-3">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-12 w-4/5" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>
        </div>
      </div>

      <div className="grid gap-8 border-t border-ft-border/90 p-5 sm:p-8 lg:grid-cols-[minmax(0,1.7fr)_320px]">
        <div className="space-y-6">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </div>
    </article>
  </section>
);

export default BlogDetailSkeleton;
