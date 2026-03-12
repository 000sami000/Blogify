import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const ProfilePageSkeleton = () => (
  <section className="mx-auto w-full max-w-[1360px] animate-fade-up space-y-6 py-6">
    <Card className="premium-panel overflow-hidden border-0 py-0">
      <Skeleton className="h-44 w-full rounded-none" />
      <CardContent className="-mt-12 space-y-5 p-5 sm:p-8">
        <div className="flex items-end gap-4">
          <Skeleton className="h-24 w-24 rounded-full border-4 border-white" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-44" />
          </div>
        </div>
        <Skeleton className="h-20 w-full rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={`private-stat-skeleton-${index}`} className="h-16 rounded-xl" />
          ))}
        </div>
      </CardContent>
    </Card>

    <Card className="premium-panel border-0">
      <CardContent className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-3 rounded-2xl border border-border bg-card p-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={`private-blog-list-skeleton-${index}`} className="h-16 rounded-xl" />
            ))}
          </div>
          <div className="space-y-3 rounded-2xl border border-border bg-card p-3">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </div>
      </CardContent>
    </Card>

    <Card className="premium-panel border-0">
      <CardContent className="space-y-3 p-5 sm:p-8">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={`private-draft-skeleton-${index}`} className="h-28 rounded-xl" />
          ))}
        </div>
      </CardContent>
    </Card>
  </section>
);

export default ProfilePageSkeleton;
