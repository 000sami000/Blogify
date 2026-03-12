"use client";

import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { blog_service, user_service } from "@/context/AppContext";
import { getApiErrorMessage } from "@/lib/api-error";
import { getAuthToken, getSecureCookieFlag } from "@/lib/auth-token";
import {
  isValidVisitorId,
  VISITOR_ID_COOKIE,
} from "@/lib/visitor-id";
import axios from "axios";
import Cookies from "js-cookie";
import {
  ArrowUpRight,
  CalendarDays,
  Eye,
  Facebook,
  Heart,
  Instagram,
  Linkedin,
  LoaderCircle,
  Mail,
  Star,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { compactCount, toCount } from "../shared/metrics";
import {
  defaultPublicBlogStats,
  PublicBlogStats,
  PublicProfileBlogsResponse,
  PublicProfileUser,
} from "./types";

interface PublicProfileClientProps {
  initialProfile: PublicProfileUser | null;
  initialBlogStats: PublicBlogStats;
  initialBlogs: PublicProfileBlogsResponse;
  profileId: string;
  viewerUserId: string | null;
  initialVisitorId?: string;
}

const PublicProfileClient = ({
  initialProfile,
  initialBlogStats,
  initialBlogs,
  profileId,
  viewerUserId,
  initialVisitorId,
}: PublicProfileClientProps) => {
  const [profile, setProfile] = useState<PublicProfileUser | null>(initialProfile);
  const [blogStats] = useState<PublicBlogStats>(initialBlogStats ?? defaultPublicBlogStats);
  const [blogsState, setBlogsState] = useState<PublicProfileBlogsResponse>(initialBlogs);
  const [starLoading, setStarLoading] = useState(false);
  const [blogsLoadingMore, setBlogsLoadingMore] = useState(false);

  const isSelfProfile = useMemo(
    () => Boolean(viewerUserId) && String(viewerUserId) === String(profileId),
    [profileId, viewerUserId]
  );

  useEffect(() => {
    if (!isValidVisitorId(initialVisitorId)) {
      return;
    }

    const existingVisitorId = Cookies.get(VISITOR_ID_COOKIE);
    if (isValidVisitorId(existingVisitorId)) {
      return;
    }

    Cookies.set(VISITOR_ID_COOKIE, initialVisitorId, {
      expires: 365,
      sameSite: "lax",
      secure: getSecureCookieFlag(),
      path: "/",
    });
  }, [initialVisitorId]);

  const toggleStar = async () => {
    if (!profileId || isSelfProfile) {
      return;
    }

    const token = getAuthToken();
    if (!token) {
      toast.error("Please login to star this profile");
      return;
    }

    try {
      setStarLoading(true);
      const { data } = await axios.post(
        `${user_service}/api/v1/user/${profileId}/star`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              starsCount: toCount(data?.starsCount),
              viewerStarred: Boolean(data?.starred),
            }
          : prev
      );
      toast.success(data?.message ?? "Profile star updated");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to update star"));
    } finally {
      setStarLoading(false);
    }
  };

  const loadMoreBlogs = async () => {
    if (blogsLoadingMore || !blogsState.hasMore) {
      return;
    }

    try {
      setBlogsLoadingMore(true);
      const nextPage = blogsState.page + 1;
      const { data } = await axios.get<Partial<PublicProfileBlogsResponse>>(
        `${blog_service}/api/v1/blog/user/${profileId}/public`,
        {
          params: {
            page: nextPage,
            limit: blogsState.limit || 6,
          },
        }
      );

      const incomingItems = Array.isArray(data?.items) ? data.items : [];
      setBlogsState((previous) => {
        const byId = new Map(previous.items.map((item) => [String(item.id), item]));
        incomingItems.forEach((item) => {
          byId.set(String(item.id), item);
        });

        return {
          ...previous,
          items: Array.from(byId.values()),
          page: toCount(data?.page) || nextPage,
          total: toCount(data?.total) || previous.total,
          hasMore: Boolean(data?.hasMore),
        };
      });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to load author blogs"));
    } finally {
      setBlogsLoadingMore(false);
    }
  };

  if (!profile) {
    return (
      <div className="glass-card mx-auto mt-6 max-w-5xl rounded-2xl p-8 text-center text-muted-foreground">
        Profile not available.
      </div>
    );
  }

  const starsCount = toCount(profile.starsCount);
  const profileVisits = toCount(profile.profileVisits);
  const statItems = [
    {
      id: "stars",
      label: "Stars",
      value: compactCount(starsCount),
      icon: Star,
      iconClass: "text-amber-500",
      fillIcon: true,
    },
    {
      id: "profileVisits",
      label: "Profile Visits",
      value: compactCount(profileVisits),
      icon: UserRound,
      iconClass: "text-indigo-600",
      fillIcon: false,
    },
    {
      id: "blogLikes",
      label: "Blog Likes",
      value: compactCount(blogStats.totalLikes),
      icon: Heart,
      iconClass: "text-rose-500",
      fillIcon: false,
    },
    {
      id: "blogViews",
      label: "Blog Views",
      value: compactCount(blogStats.totalViews),
      icon: Eye,
      iconClass: "text-emerald-600",
      fillIcon: false,
    },
  ] as const;

  return (
    <section className="mx-auto w-full max-w-[1500px] animate-fade-up space-y-5 py-6">
      <Card className="premium-panel relative gap-0 overflow-hidden border-0 py-0">
        <div className="relative h-44 overflow-hidden sm:h-56">
          {profile.banner ? (
            <img src={profile.banner} alt={`${profile.name} banner`} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.35),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(251,191,36,0.25),transparent_45%),linear-gradient(135deg,#0f172a,#1e293b_45%,#0f172a_100%)]" />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.08),transparent_45%),linear-gradient(0deg,rgba(15,23,42,0.7),transparent_55%)]" />
          <div className="absolute inset-0 opacity-50 [background-size:24px_24px] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.2)_1px,transparent_0)]" />
          <div className="pointer-events-none absolute -left-10 top-6 h-28 w-28 rounded-full bg-sky-400/25 blur-3xl" />
          <div className="pointer-events-none absolute -right-6 bottom-0 h-32 w-32 rounded-full bg-amber-300/30 blur-3xl" />
          <div className="absolute right-4 top-4 rounded-full border border-white/30 bg-slate-900/45 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
            {compactCount(starsCount)} stars
          </div>
        </div>

        <CardHeader className="relative -mt-14">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <Avatar className="h-24 w-24 border-4 border-white shadow-lg sm:h-28 sm:w-28">
                <AvatarImage src={profile.image} alt="profile picture" />
              </Avatar>
              <div>
                <CardTitle className="premium-section-title text-3xl text-foreground">{profile.name}</CardTitle>
                <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="size-4" />
                  {profile.email}
                </p>
              </div>
            </div>

            {!isSelfProfile && (
              <Button
                type="button"
                onClick={() => void toggleStar()}
                disabled={starLoading}
                className={`rounded-full ${
                  profile.viewerStarred ? "bg-amber-500 text-slate-950 hover:bg-amber-400" : ""
                }`}
              >
                {starLoading ? (
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                ) : (
                  <Star className={`mr-2 size-4 ${profile.viewerStarred ? "fill-current" : ""}`} />
                )}
                {profile.viewerStarred ? "Starred" : "Give Star"}
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-5 p-5 pt-0 sm:p-8 sm:pt-0">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {statItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.id} className="premium-kpi flex items-center justify-between gap-3 p-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={item.label}
                        className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-card/70 transition hover:-translate-y-0.5"
                      >
                        <Icon className={`size-4 ${item.iconClass} ${item.fillIcon ? "fill-current" : ""}`} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={8}>
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                  <p className="text-2xl font-semibold text-foreground">{item.value}</p>
                </div>
              );
            })}
          </div>

          <div className="premium-panel-soft p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">About</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {profile.bio?.trim() || "This writer has not added a bio yet."}
            </p>
            <p className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Heart className="size-3.5" />
              {compactCount(blogStats.totalLikes)} likes across {compactCount(blogStats.totalBlogs)} published blogs
              <Eye className="ml-2 size-3.5" />
              {compactCount(blogStats.totalViews)} views
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {profile.instagram && (
              <a
                href={profile.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground transition hover:-translate-y-0.5"
              >
                <Instagram className="size-4 text-pink-500" />
                Instagram
              </a>
            )}
            {profile.facebook && (
              <a
                href={profile.facebook}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground transition hover:-translate-y-0.5"
              >
                <Facebook className="size-4 text-blue-600" />
                Facebook
              </a>
            )}
            {profile.linkedin && (
              <a
                href={profile.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground transition hover:-translate-y-0.5"
              >
                <Linkedin className="size-4 text-blue-700" />
                LinkedIn
              </a>
            )}
            {!profile.instagram && !profile.facebook && !profile.linkedin && (
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
                <UserRound className="size-4" />
                No social links available
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Published Blogs
              </p>
              <span className="text-xs text-muted-foreground">
                {compactCount(blogsState.total)} total
              </span>
            </div>

            {blogsState.items.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {blogsState.items.map((blog) => {
                  const createdAt = blog.createAt ?? blog.created_at;
                  return (
                    <Link
                      key={String(blog.id)}
                      href={`/blog/${blog.id}`}
                      className="premium-list-item block p-4 transition hover:-translate-y-0.5"
                    >
                      <p className="line-clamp-2 text-base font-semibold text-foreground">
                        {blog.title}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {blog.description}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="size-3.5" />
                          {createdAt && !Number.isNaN(new Date(createdAt).getTime())
                            ? new Date(createdAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })
                            : "Recent"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Heart className="size-3.5 text-rose-500" />
                          {compactCount(toCount(blog.likesCount ?? blog.likes_count ?? 0))}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Eye className="size-3.5 text-emerald-600" />
                          {compactCount(toCount(blog.viewsCount ?? blog.views_count ?? 0))}
                        </span>
                        <span className="ml-auto inline-flex items-center gap-1 text-ft-accent">
                          Open <ArrowUpRight className="size-3.5" />
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="premium-panel-soft p-4 text-sm text-muted-foreground">
                No published blogs yet.
              </div>
            )}

            {blogsState.hasMore && (
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-border bg-card"
                onClick={() => void loadMoreBlogs()}
                disabled={blogsLoadingMore}
              >
                {blogsLoadingMore ? "Loading..." : "Load more blogs"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
};

export default PublicProfileClient;
