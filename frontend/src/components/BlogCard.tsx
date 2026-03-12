import Link from "next/link";
import React from "react";
import { Card } from "./ui/card";
import { ArrowUpRight, Calendar, Eye, Heart } from "lucide-react";
import moment from "moment";
import { formatCompactCount } from "@/lib/format-count";

interface BlogCardProps {
  image: string;
  title: string;
  desc: string;
  id: string;
  time?: string;
  category?: string;
  likesCount?: number;
  viewsCount?: number;
}

const BlogCard: React.FC<BlogCardProps> = ({
  image,
  title,
  desc,
  id,
  time,
  category,
  likesCount,
  viewsCount,
}) => {
  const safeTime = time && !Number.isNaN(new Date(time).getTime()) ? time : undefined;

  return (
    <Link href={`/blog/${id}`} className="block">
      <Card className="premium-panel float-card group animate-fade-up overflow-hidden border-ft-border/90 py-0">
        <div className="relative h-[220px] w-full overflow-hidden">
          <img
            src={image}
            alt={title}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          {category && <span className="premium-chip absolute left-3 top-3">{category}</span>}
        </div>

        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-[0.16em] text-ft-muted">
            <p className="flex items-center gap-2">
              <Calendar size={14} />
              <span>{safeTime ? moment(safeTime).format("DD MMM YYYY") : "Recent"}</span>
            </p>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1 rounded-full border border-ft-border bg-ft-card px-2 py-1">
                <Eye size={13} className="text-ft-sky" />
                {formatCompactCount(viewsCount ?? 0)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-ft-border bg-ft-card px-2 py-1">
                <Heart size={13} className="text-ft-accent" />
                {formatCompactCount(likesCount ?? 0)}
              </span>
            </div>
          </div>

          <h2 className="line-clamp-2 text-xl font-semibold text-ft-text">{title}</h2>
          <p className="line-clamp-2 text-sm text-ft-muted">{desc}</p>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-ft-muted">Open article</span>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-ft-accent">
              Read more <ArrowUpRight className="size-4" />
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
};

export default BlogCard;
