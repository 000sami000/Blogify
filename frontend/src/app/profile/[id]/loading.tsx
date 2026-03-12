import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const Loading = () => (
  <section className="mx-auto w-full max-w-[1120px] animate-fade-up space-y-5 py-6">
    <Card className="premium-panel overflow-hidden border-0 py-0">
      <Skeleton className="h-52 w-full rounded-none" />
      <CardContent className="-mt-12 space-y-5 p-5 sm:p-8">
        <div className="flex items-end gap-4">
          <Skeleton className="h-24 w-24 rounded-full border-4 border-white" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-52" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={`public-profile-stat-${index}`} className="h-16 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-20 rounded-xl" />
      </CardContent>
    </Card>
  </section>
);

export default Loading;
